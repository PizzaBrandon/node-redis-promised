var Promise = require('bluebird');
var Command = require('./command');

var commandlist = require('./commandlist');

function MultiCommand(command) {
	var self = this;

	self.command = command.toLowerCase();

	// Copy arguments to array, but ignore first element
	var args = Array.prototype.slice.call(arguments, 1);
	if (args.length === 1 && Array.isArray(args[0])) {
		args = args[0];
	}

	var callback;

	if (args.length && typeof args[args.length - 1] === 'function') {
		callback = args.pop();
	}

	while (args.length && args[args.length - 1] === undefined) {
		args.pop();
	}

	self.args = args;

	self.promise = new Promise(function commandPromise(resolve, reject) {
		self.resolve = resolve;
		self.reject = reject;
	}).nodeify(callback);
}

MultiCommand.prototype.generateCommand = function generateCommand() {
	if (this.generatedCommand) {
		return this.generatedCommand;
	}

	var argsArray = [this.command];
	if (this.args) {
		Array.prototype.push.apply(argsArray, this.args);
	}

	this.generatedCommand = Object.create(Command.prototype);
	Command.apply(this.generatedCommand, argsArray);

	return this.generatedCommand;
};

function Multi(client, args) {
	var multiCommand;

	this._client = client;
	this.queue = [
		new MultiCommand('MULTI')
	];

	if (Array.isArray(args)) {
		for (var i = 0, il = args.length; i < il; i++) {
			multiCommand = Object.create(MultiCommand.prototype);
			MultiCommand.apply(multiCommand, args[i]);
			this.queue.push(multiCommand);
		}
	}

	this.executed = false;
}

commandlist.forEach(function parseCommands(fullCommand) {
	var command = fullCommand.split(' ')[0];

	Multi.prototype[command.toUpperCase()] = Multi.prototype[command] = function multiCommand() {
		var multiCommandObj = new MultiCommand(command, Array.prototype.slice.call(arguments));

		this.queue.push(multiCommandObj);

		return this;
	};
});

Multi.prototype.HMSET = Multi.prototype.hmset = function hmsetCommand() {
	var args = Array.prototype.slice.call(arguments),
		tmpArgs;
	if (args.length >= 2 && typeof args[0] === 'string' && typeof args[1] === 'object') {
		tmpArgs = [args[0]];
		Object.keys(args[1]).map(function mapArgs(key) {
			tmpArgs.push(key);
			tmpArgs.push(args[1][key]);
		});
		if (args[2]) {
			tmpArgs.push(args[2]);
		}
		args = tmpArgs;
	}

	var multiCommandObj = new MultiCommand('hmset', args);

	this.queue.push(multiCommandObj);

	return this;
};

Multi.prototype.EXEC = Multi.prototype.exec = function exec(callback) {
	var self = this;

	if (this.executed) {
		throw new Error('This multi has already been executed');
	}
	this.executed = true;

  function processQueuedCommand(multiCommand) {
		return self._client._send(multiCommand.generateCommand());
  }

	var execCommand = new MultiCommand('exec');

	this.queue.push(execCommand);

	// drain queue, callback will catch 'QUEUED' or error
	this.promises = this.queue.map(processQueuedCommand);

	return Promise.all(this.promises)
		.then(function parsePromises() {
			return execCommand.generatedCommand.promise;
		})
		.then(function multiExecResolve(replies) {
			var i, il, reply, command;

			if (replies) {
				for (i = 0, il = replies.length - 1; i < il; i += 1) {
					reply = replies[i];
					command = self.queue[i + 1];

					// TODO - confusing and error-prone that hgetall is special cased in two places
					if (reply && command.command === 'hgetall') {
						replies[i] = reply = self._client.replyToObject(reply);
					}

					command.resolve(reply);
				}
			}

			return replies;
		})
		.nodeify(callback);
};

module.exports = Multi;
