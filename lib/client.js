/* global Buffer require exports console setTimeout */

var net = require('net'),
	util = require('util'),
	Command = require('./command'),
  Multi = require('./multi'),
	Queue = require('./queue'),
	commandlist = require('./commandlist'),
	events = require('events'),
	crypto = require('crypto'),
	Promise = require('bluebird');

var connectionId = 0,
	FORCE_SEND = true;

function initializeRetryVars() {
	this.retry = {
		timer: null,
		totalTime: 0,
		delay: 150,
		backoff: 1.7
	};
	this.attempts = 1;
}

function attachStreamListeners() {
	var self = this;

	self.stream.on('connect', function streamOnConnect() {
		self.onConnect();
	});

	self.stream.on('data', function streamOnData(bufferFromSocket) {
		self.onData(bufferFromSocket);
	});

	self.stream.on('error', function streamOnError(msg) {
		self.onError(msg.message);
	});

	self.stream.on('close', function streamOnClose() {
		self.connectionGone('close');
	});

	self.stream.on('end', function streamOnEnd() {
		self.connectionGone('end');
	});

	self.stream.on('drain', function streamOnDrain() {
		self.shouldBuffer = false;
		self.emit('drain');
	});
}

function RedisClient(stream, options) {
	this.stream = stream;
	this.options = options = options || {};

	this.connectionId = ++connectionId;
	this.connected = false;
	this.ready = false;
	this.connections = 0;

	if (this.options.socketNoDelay === undefined) {
		this.options.socketNoDelay = true;
	}
	if (this.options.socketKeepAlive === undefined) {
		this.options.socketKeepAlive = true;
	}

	this.maxAttempts = null;
	if (options.maxAttempts && !isNaN(options.maxAttempts) && options.maxAttempts > 0) {
		this.maxAttempts = parseInt(options.maxAttempts, 10);
	}
	this.connectTimeout = false;
	if (options.connectTimeout && !isNaN(options.connectTimeout) && options.connectTimeout > 0) {
		this.connectTimeout = parseInt(options.connectTimeout, 10);
	}
	this.retryMaxDelay = null;
	if (options.retryMaxDelay !== undefined && !isNaN(options.retryMaxDelay) && options.retryMaxDelay > 0) {
		this.retryMaxDelay = options.retryMaxDelay;
	}

	this.shouldBuffer = false;
	this.commandQueueHighWater = this.options.commandQueueHighWater || 1000;
	this.commandQueuelowWater = this.options.commandQueuelowWater || 0;
	this.commandQueue = new Queue(); // holds sent commands to de-pipeline them
	this.offlineQueue = new Queue(); // holds commands issued but not able to be sent
	this.commandsSent = 0;
	this.enableOfflineQueue = true;
	if (typeof this.options.enableOfflineQueue === 'boolean') {
		this.enableOfflineQueue = this.options.enableOfflineQueue;
	}

	initializeRetryVars(this);

	this.pubSubMode = false;
	this.subscriptionSet = {};
	this.monitoring = false;
	this.closing = false;
	this.serverInfo = {};
	this.authPass = null;
	if (options.authPass !== undefined) {
		this.authPass = options.authPass;
	}
	this.selectedDb = null; // save the selected db here, used when reconnecting

	this.oldState = null;

	attachStreamListeners.call(this);

	events.EventEmitter.call(this);
}
util.inherits(RedisClient, events.EventEmitter);

RedisClient.prototype.unref = function unref() {
	if (this.connected) {
		this.stream.unref();
	} else {
		this.once('connect', function onConnectUnref() {
			this.unref();
		});
	}
};

// flush offlineQueue and commandQueue, erroring promises along the way
RedisClient.prototype.flushAndError = function flushAndError(message) {
	var commandObj, error;

	function rejectCommandObj() {
		commandObj.reject(error);
	}

	error = new Error(message);

	while (this.offlineQueue.length > 0) {
		commandObj = this.offlineQueue.shift();

		process.nextTick(rejectCommandObj);
	}
	this.offlineQueue = new Queue();

	while (this.commandQueue.length > 0) {
		commandObj = this.commandQueue.shift();

		process.nextTick(rejectCommandObj);
	}
	this.commandQueue = new Queue();
};

RedisClient.prototype.onError = function onError(msg) {
	var message = 'Redis connection to ' + this.address + ' failed - ' + msg;

	if (this.closing) {
		return;
	}

	this.flushAndError(message);

	this.connected = false;
	this.ready = false;

	this.emit('error', new Error(message));
	// 'error' events get turned into exceptions if they aren't listened for.  If the user handled this error
	// then we should try to reconnect.
	this.connectionGone('error');
};

RedisClient.prototype.doAuth = function doAuth() {
	var self = this;

	var tryAuth;

	function handleAuthResponse() {
		// now we are really connected
		self.emit('connect');
		initializeRetryVars.call(self);

		if (self.options.noReadyCheck) {
			self.onReady();
		} else {
			self.readyCheck();
		}
	}

	function handleAuthError(error) {
		if (error.toString().match('LOADING')) {
			// if redis is still loading the db, it will not authenticate and everything else will fail

			setTimeout(tryAuth, 2000); // TODO - magic number alert
			return;

		} else if (error.toString().match('no password is set')) {
			// Redis didn't require a password
			handleAuthResponse();
			return;

		} else {
			self.emit('error', new Error('Auth error: ' + error.message));
			return;

		}
	}

	tryAuth = function tryAuth() {
		self.sendCommand('auth', [self.authPass], FORCE_SEND)
			.then(handleAuthResponse)
			.catch(handleAuthError);
	};

	tryAuth();
};

RedisClient.prototype.onConnect = function onConnect() {
	this.connected = true;
	this.ready = false;
	this.connections += 1;
	this.commandQueue = new Queue();
	this.emittedEnd = false;
	if (this.options.socketNoDelay) {
		this.stream.setNoDelay();
	}
	this.stream.setKeepAlive(this.options.socketKeepAlive);
	this.stream.setTimeout(0);

	this.initParser();

	if (this.authPass) {
		this.doAuth();
	} else {
		this.emit('connect');
		initializeRetryVars.call(this);

		if (this.options.noReadyCheck) {
			this.onReady();
		} else {
			this.readyCheck();
		}
	}
};

RedisClient.prototype.initParser = function initParser() {
	var self = this;

	var redisParser;
	// hiredis might not be installed
	try {
		redisParser = require('./parser/hiredis');
	} catch (err) {
		redisParser = require('./parser/javascript');
	}

	self.parserModule = redisParser;

	// return_buffers sends back Buffers from parser to callback. detect_buffers sends back Buffers from parser, but
	// converts to Strings if the input arguments are not Buffers.
	self.replyParser = new redisParser.Parser({
		returnBuffers: self.options.returnBuffers || self.options.detectBuffers || false
	});

	self.replyParser.on('reply', function parserReply(reply) {
		self._returnReply(reply);
	});

	self.replyParser.on('error', function parserError(err) {
		self._returnError(err);
	});
};

RedisClient.prototype.onReady = function onReady() {
	var self = this;

	self.ready = true;

	if (self.oldState !== null) {
		self.monitoring = self.oldState.monitoring;
		self.pubSubMode = self.oldState.pubSubMode;
		self.selectedDb = self.oldState.selectedDb;
		self.oldState = null;
	}

	// magically restore any modal commands from a previous connection
	if (self.selectedDb !== null) {
		// this trick works if and only if the following sendCommand
		// never goes into the offline queue
		var pubSubMode = self.pubSubMode;
		self.pubSubMode = false;
		self.select([self.selectedDb]).finally(function resetPubSub() {
			self.pubSubMode = pubSubMode;
		});
	}

	if (self.pubSubMode) {
		var promises = Object.keys(self.subscriptionSet).map(function parseSubscriptionSet(key) {
			var parts = key.split(' ');
			var command = parts[0];
			var arg = parts[1];

			return self.sendCommand(command + 'scribe', [arg]);
		});

		Promise.all(promises).then(function allPromisesComplete() {
			self.emit('ready');
		});

		return;

	} else if (self.monitoring) {
		self.sendCommand('monitor');

	} else {
		self.sendOfflineQueue();

	}
	self.emit('ready');
};

RedisClient.prototype.readyCheck = function readyCheck() {
	var self = this;

	function scheduleNextReadyCheck() {
		self.readyCheck();
	}

	function handleReadyResponse(res) {
		var obj = {},
			lines, retryTime;

		lines = res.toString().split('\r\n');

		lines.forEach(function separateLines(line) {
			var parts = line.split(':');
			if (parts[1]) {
				obj[parts[0]] = parts[1];
			}
		});

		obj.versions = [];
		if (obj.redis_version) {
			obj.redis_version.split('.').forEach(function gatherRedisVersions(num) {
				obj.versions.push(+num);
			});
		}

		// expose info key/vals to users
		self.serverInfo = obj;

		if (!obj.loading || obj.loading && obj.loading === '0') {
			self.onReady();

		} else {
			retryTime = obj.loading_eta_seconds * 1000;
			if (retryTime > 1000) {
				retryTime = 1000;
			}

			setTimeout(scheduleNextReadyCheck, retryTime);
		}
	}

	function handleReadyError(err) {
		self.emit('error', new Error('Ready check failed: ' + err.message));
	}

	self.sendCommand('info', [], FORCE_SEND)
		.then(handleReadyResponse)
		.catch(handleReadyError);
};

RedisClient.prototype.sendOfflineQueue = function sendOfflineQueue() {
	var self = this,
		queueLen = self.offlineQueue.length;

	while (self.offlineQueue.length) {
		self._send(self.offlineQueue.shift());
	}
	self.offlineQueue = new Queue();

	if (queueLen) {
		self.shouldBuffer = false;
		self.emit('drain');
	}
};

RedisClient.prototype.connectionGone = function connectionGone(why) {
	var self = this;

	function retryConnection() {
		self.retryTotalTime += self.retryDelay;

		if (self.connectTimeout && self.retryTotalTime >= self.connectTimeout) {
			self.retryTimer = null;
			self.redisBroken = true;
			self.emit('error', new Error('Redis failed to reconnect after ' + self.retryTotalTime + ' ms.'));
			return;
		}

		self.stream = net.createConnection(self.connectionOption);
		attachStreamListeners.call(self);
		self.retryTimer = null;
	}

	// If a retry is already in progress, just let that happen
	if (self.retryTimer) {
		return;
	}

	self.connected = false;
	self.ready = false;

	if (!self.oldState) {
		self.oldState = {
			monitoring: self.monitoring,
			pubSubMode: self.pubSubMode,
			selectedDb: self.selectedDb
		};
		self.monitoring = false;
		self.pubSubMode = false;
		self.selectedDb = null;
	}

	// since we are collapsing end and close, users don't expect to be called twice
	if (!self.emittedEnd) {
		self.emit('end');
		self.emittedEnd = true;
	}

	self.flushAndError('Redis connection gone from ' + why + ' event.');

	// If this is a requested shutdown, then don't retry
	if (self.closing) {
		self.retryTimer = null;
		return;
	}

	var nextDelay = Math.floor(self.retryDelay * self.retryBackoff);
	if (self.retryMaxDelay !== null && nextDelay > self.retryMaxDelay) {
		self.retryDelay = self.retryMaxDelay;
	} else {
		self.retryDelay = nextDelay;
	}

	if (self.maxAttempts && self.attempts >= self.maxAttempts) {
		self.retryTimer = null;
		self.redisBroken = true;
		self.emit('error', new Error('Redis failed to reconnect after ' + self.maxAttempts + ' attempts.'));
		return;
	}

	self.attempts += 1;
	self.emit('reconnecting', {
		delay: self.retryDelay,
		attempt: self.attempts
	});
	self.retryTimer = setTimeout(retryConnection, self.retryDelay);
};

RedisClient.prototype.onData = function onData(data) {
	try {
		this.replyParser.execute(data);
	} catch (err) {
		this.emit('error', err);
	}
};

RedisClient.prototype._returnError = function returnError(err) {
	var commandObj = this.commandQueue.shift(),
		queueLen = this.commandQueue.getLength();

	if (this.pubSubMode === false && queueLen === 0) {
		this.commandQueue = new Queue();
		this.emit('idle');
	}

	if (this.shouldBuffer && queueLen <= this.commandQueueLowWater) {
		this.emit('drain');
		this.shouldBuffer = false;
	}

	commandObj.reject(typeof err === 'string' ? new Error(err) : err);
};

// hgetall converts its replies to an Object.  If the reply is empty, null is returned.
function replyToObject(reply) {
	var obj = {},
		j, jl, key, val;

	if (reply.length === 0) {
		return null;
	}

	for (j = 0, jl = reply.length; j < jl; j += 2) {
		key = reply[j].toString('binary');
		val = reply[j + 1];
		obj[key] = val;
	}

	return obj;
}
RedisClient.prototype.replyToObject = replyToObject;

function replyToStrings(reply) {
	var i;

	if (Buffer.isBuffer(reply)) {
		return reply.toString();
	}

	if (Array.isArray(reply)) {
		for (i = 0; i < reply.length; i++) {
			if (reply[i] !== null && reply[i] !== undefined) {
				reply[i] = reply[i].toString();
			}
		}
		return reply;
	}

	return reply;
}

RedisClient.prototype._returnReply = function returnReply(reply) {
	var commandObj, len, type, timestamp, argindex, args, queueLen;

	// If the 'reply' here is actually a message received asynchronously due to a
	// pubsub subscription, don't pop the command queue as we'll only be consuming
	// the head command prematurely.
	if (Array.isArray(reply) && reply.length > 0 && reply[0]) {
		type = reply[0].toString();
	}

	if (!(this.pubSubMode && (type === 'message' || type === 'pmessage'))) {
		commandObj = this.commandQueue.shift();
	}

	queueLen = this.commandQueue.getLength();

	if (!this.pubSubMode && queueLen === 0) {
		this.commandQueue = new Queue(); // explicitly reclaim storage from old Queue
		this.emit('idle');
	}

	if (this.shouldBuffer && queueLen <= this.commandQueueLowWater) {
		this.emit('drain');
		this.shouldBuffer = false;
	}

	if (commandObj && !commandObj.subCommand) {
		if (this.options.detectBuffers && !commandObj.bufferArgs) {
			// If detect_buffers option was specified, then the reply from the parser will be Buffers.
			// If this command did not use Buffer arguments, then convert the reply to Strings here.
			reply = replyToStrings(reply);
		}

		// TODO - confusing and error-prone that hgetall is special cased in two places
		if (reply && commandObj.command === 'hgetall') {
			reply = replyToObject(reply);
		}

		commandObj.resolve(reply);

	} else if (this.pubSubMode || commandObj && commandObj.subCommand) {
		if (Array.isArray(reply)) {
			type = reply[0].toString();

			if (type === 'message') {
				this.emit('message', reply[1].toString(), reply[2]); // channel, message

			} else if (type === 'pmessage') {
				this.emit('pmessage', reply[1].toString(), reply[2].toString(), reply[3]); // pattern, channel, message

			} else if (type === 'subscribe' || type === 'unsubscribe' || type === 'psubscribe' || type === 'punsubscribe') {
				if (reply[2] === 0) {
					this.pubSubMode = false;

				} else {
					this.pubSubMode = true;
				}

				// subscribe commands take an optional callback and also emit an event, but only the first response is included in the callback
				// TODO - document this or fix it so it works in a more obvious way
				// reply[1] can be null
				var reply1String = reply[1] === null ? null : reply[1].toString();

				commandObj.resolve(reply1String);

				this.emit(type, reply1String, reply[2]); // channel, count

			} else {
				commandObj.reject(new Error('subscriptions are active but got unknown reply type ' + type));

			}
		} else if (!this.closing) {
			commandObj.reject(new Error('subscriptions are active but got an invalid reply: ' + reply));

		}
	} else if (this.monitoring) {
		len = reply.indexOf(' ');
		timestamp = reply.slice(0, len);
		argindex = reply.indexOf('"');
		args = reply.slice(argindex + 1, -1).split('" "').map(function mapMonitoringArgs(elem) {
			return elem.replace(/\\"/g, '"');
		});
		this.emit('monitor', timestamp, args);

	} else {
		this.emit('error', new Error('node-redis-promised command queue state error. If you can reproduce this, please report it.'));
	}
};

RedisClient.prototype.sendCommand = function sendCommand(command, args, forceSend, callback) {
	var self = this;
	var commandCallback, commandObj;

	// Process arguments
	if (Array.isArray(args)) {
		if (typeof callback === 'function') {
			commandCallback = callback;

		} else if (!callback) {
			if (typeof args[args.length - 1] === 'function' || typeof args[args.length - 1] === 'undefined') {
				commandCallback = args.pop();
			}

		} else {
			throw new Error('sendCommand: last argument must be a callback or undefined');

		}
	} else {
		throw new Error('sendCommand: second argument must be an array');

	}

	if (commandCallback && process.domain) {
		commandCallback = process.domain.bind(commandCallback);
	}

	if (typeof command !== 'string') {
		throw new Error('First argument to sendCommand must be the command name string, not ' + typeof command);
	}

	command = command.toLowerCase();

	if ((command === 'sadd' || command === 'srem') && args.length && Array.isArray(args[args.length - 1])) {
		args = args.slice(0, -1).concat(args[args.length - 1]);
	}

	// if the value is undefined or null and command is set or setex, need not to send message to redis
	if (command === 'set' || command === 'setex') {
		if (args[args.length - 1] === undefined || args[args.length - 1] === null) {
			throw new Error('sendCommand: ' + command + ' value must not be undefined or null');
		}
	}

	commandObj = new Command(command, args);

	self._send(commandObj, forceSend);

	return commandObj.promise.nodeify(commandCallback);
};

RedisClient.prototype._send = function sendRedisCommand(commandObj, forceSend) {
	var self = this;
	var command = commandObj.command,
		writes, i, il, bufferedWrites = false;

	if (!self.ready && !forceSend || !self.stream.writable) {
		if (self.enableOfflineQueue) {
			self.offlineQueue.push(commandObj);
			self.shouldBuffer = true;

		} else {
			commandObj.reject(new Error('sendCommand: stream not writeable. enableOfflineQueue is false'));
		}

		return commandObj.promise;
	}

	if (command === 'subscribe' || command === 'unsubscribe' || command === 'psubscribe' || command === 'punsubscribe') {
		self.pubSubCommand(commandObj);

	} else if (command === 'monitor') {
		self.monitoring = true;

	} else if (command === 'quit') {
		self.closing = true;

	} else if (self.pubSubMode === true) {
		commandObj.reject(new Error('Connection in subscriber mode, only subscriber commands may be used'));
		return commandObj.promise;
	}
	self.commandQueue.push(commandObj);
	self.commandsSent += 1;

	writes = commandObj.write();

	for (i = 0, il = writes.length; i < il; i++) {
		bufferedWrites |= !self.stream.write(writes[i]);
	}

	if (bufferedWrites || self.commandQueue.getLength() >= self.commandQueueHighWater) {
		self.shouldBuffer = true;
	}

	return commandObj.promise;
};


RedisClient.prototype.pubSubCommand = function pubSubCommand(commandObj) {
	var i, key, command, args;

	this.pubSubMode = true;
	commandObj.subCommand = true;

	command = commandObj.command;
	args = commandObj.args;
	if (command === 'subscribe' || command === 'psubscribe') {
		if (command === 'subscribe') {
			key = 'sub';
		} else {
			key = 'psub';
		}
		for (i = 0; i < args.length; i++) {
			this.subscriptionSet[key + ' ' + args[i]] = true;
		}
	} else {
		if (command === 'unsubscribe') {
			key = 'sub';
		} else {
			key = 'psub';
		}
		for (i = 0; i < args.length; i++) {
			delete this.subscriptionSet[key + ' ' + args[i]];
		}
	}
};

function noop(){}

RedisClient.prototype.end = function endClient() {
	this.stream._events = {};

	//clear retry_timer
	if (this.retryTimer) {
		clearTimeout(this.retryTimer);
		this.retryTimer = null;
	}
	this.stream.on('error', noop);

	this.connected = false;
	this.ready = false;
	this.closing = true;
	return this.stream.destroySoon();
};


commandlist.forEach(function parseCommands(fullCommand) {
	var command = fullCommand.split(' ')[0];

	RedisClient.prototype[command.toUpperCase()] = RedisClient.prototype[command] = function redisCommand(args, callback) {
		if (Array.isArray(args) && typeof callback === 'function') {
			return this.sendCommand(command, args, callback);
		} else {
			return this.sendCommand(command, Array.prototype.slice.call(arguments));
		}
	};
});

// store db in this.selected_db to restore it on reconnect
RedisClient.prototype.SELECT = RedisClient.prototype.select = function selectCommand(db, callback) {
	var self = this;

	return self.sendCommand('select', [db])
		.then(function selectCommandResolved(reply) {
			self.selectedDb = db;
			return reply;
		})
		.nodeify(callback);
};

// Stash auth for connect and reconnect.  Send immediately if already connected.
RedisClient.prototype.AUTH = RedisClient.prototype.auth = function authCommand() {
	var args = Array.prototype.slice.call(arguments), authCallback;
	this.authPass = args[0];

	if (typeof args[args.length - 1] === 'function') {
		authCallback = args.pop();
	}

	return this.sendCommand('auth', args)
		.nodeify(authCallback);
};

RedisClient.prototype.HMGET = RedisClient.prototype.hmget = function hmgetCommand(arg1, arg2, arg3) {
	if (Array.isArray(arg2) && typeof arg3 === 'function') {
		return this.sendCommand('hmget', [arg1].concat(arg2), arg3);
	} else if (Array.isArray(arg1) && typeof arg2 === 'function') {
		return this.sendCommand('hmget', arg1, arg2);
	} else {
		return this.sendCommand('hmget', Array.prototype.slice.call(arguments));
	}
};

RedisClient.prototype.HMSET = RedisClient.prototype.hmset = function hmsetCommand(args, callback) {
	var tmpArgs, tmpKeys, i, il, key;

	if (Array.isArray(args) && typeof callback === 'function') {
		return this.sendCommand('hmset', args, callback);
	}

	args = Array.prototype.slice.call(arguments);
	if (typeof args[args.length - 1] === 'function') {
		callback = args[args.length - 1];
		args.length -= 1;
	} else {
		callback = null;
	}

	if (args.length === 2 && (typeof args[0] === 'string' || typeof args[0] === 'number') && typeof args[1] === 'object') {
		// User does: client.hmset(key, {key1: val1, key2: val2})
		// assuming key is a string, i.e. email address

		// if key is a number, i.e. timestamp, convert to string
		if (typeof args[0] === 'number') {
			args[0] = args[0].toString();
		}

		tmpArgs = [args[0]];
		tmpKeys = Object.keys(args[1]);
		for (i = 0, il = tmpKeys.length; i < il; i++) {
			key = tmpKeys[i];
			tmpArgs.push(key);
			tmpArgs.push(args[1][key]);
		}
		args = tmpArgs;
	}

	return this.sendCommand('hmset', args, callback);
};

RedisClient.prototype.MULTI = RedisClient.prototype.multi = function multiCommand(args) {
	return new Multi(this, args);
};

// hook eval with an attempt to evalsha for cached scripts
RedisClient.prototype.EVAL = RedisClient.prototype.eval = function evalCommand() {
	var self = this,
		args = Array.prototype.slice.call(arguments),
		callback;

	if (typeof args[args.length - 1] === 'function') {
		callback = args.pop();
	}

	if (Array.isArray(args[0])) {
		args = args[0];
	}

	// replace script source with sha value
	var source = args[0];
	args[0] = crypto.createHash('sha1').update(source).digest('hex');

	return self.evalsha(args)
		.catch(function evalShaRejected() {
			// fall back to standard eval
			args[0] = source;
			return self.sendCommand('eval', args);
		})
		.nodeify(callback);
};

// Appears the redis client isn't returning the next number correctly on INCR, but does on get
RedisClient.prototype.INCR = RedisClient.prototype.incr = function incrCommand(key, callback) {
	var self = this;

	return self.sendCommand('incr', [key])
		.then(function incrReply() {
			return self.sendCommand('get', [key]);
		})
		.nodeify(callback);
};

module.exports = RedisClient;
