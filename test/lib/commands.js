/* global describe, it, beforeEach, afterEach */
/* eslint-disable func-names */

var redis = require('../../index');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var crypto = require('crypto');
var should = chai.should();
chai.use(chaiAsPromised);

var HOST = '127.0.0.1';
var PORT = 6379;
var TEST_DB_NUM = 15;

var serverVersion;

function checkMinServerVersion(desiredVersion) {
	var match = !!serverVersion;

	for (var i = 0; i < 3 && match; i++) {
		match &= serverVersion[i] >= desiredVersion[i];
	}
	return match;
}

describe('test redis commands', function() {
	var client;

	beforeEach(function(done) {
		client = redis.createClient(PORT, HOST);
		client.once('ready', function() {
			serverVersion = client.serverInfo.versions;
			done();
		});
	});

	afterEach(function(done) {
		if (client) {
			client.quit();
		}
		client = null;
		done();
	});

	describe('select', function() {
		it('selects db', function() {
			return client.select(TEST_DB_NUM).should.eventually.equal('OK');
		});

		it('also uses callback', function(done) {
			client.select(TEST_DB_NUM, function(err, reply) {
				should.not.exist(err);
				reply.should.equal('OK');
				done();
			});
		});

		it('errors on bad db', function() {
			return client.select('baddb')
				.then(function(reply) {
					// It should never make it here
					should.not.exist(reply);
					false.should.equal(true);
				})
				.catch(function(err) {
					should.exist(err);
					err.should.deep.equal(new Error('ERR invalid DB index'));
				});
		});
	});

	describe('flushdb', function() {
		it('flushes db', function() {
			return client.set('key1', '1')
				.then(function(reply) {
					reply.should.equal('OK');

					return client.flushdb();
				})
				.then(function(reply) {
					reply.should.equal('OK');

					return client.dbsize();
				})
				.then(function(reply) {
					return reply.should.equal(0);
				});
		});

		it('also uses callback', function(done) {
			client.set('key1', '1', function(err, reply) {
				should.not.exist(err);
				reply.should.equal('OK');

				client.flushdb(function(err, reply) {
					should.not.exist(err);
					reply.should.equal('OK');

					client.dbsize(function(err, reply) {
						should.not.exist(err);
						reply.should.equal(0);

						done();
					});
				});
			});
		});
	});

	describe('incr', function() {
		it('increases key\'s value', function() {
			if (client.parserModule.name === 'hiredis') {
				console.log('Skipping INCR buffer test with hiredis');
				return true;
			}

			return client.set('seqtest', '9007199254740992')
				.then(function(reply) {
					reply.should.equal('OK');

					return client.incr('seqtest');
				})
				.then(function(reply) {
					return reply.should.equal('9007199254740993');
				});
		});
	});

	describe('eval', function() {
		it('should evaluate Lua integer', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.eval('return 100.5', 0)
				.then(function(reply) {
					reply.should.equal(100);
				});
		});

		it('should evaluate Lua string', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.eval('return \'hello world\'', 0)
				.then(function(reply) {
					reply.should.equal('hello world');
				});
		});

		it('should evaluate Lua true boolean', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.eval('return true', 0)
				.then(function(reply) {
					reply.should.equal(1);
				});
		});

		it('should evaluate Lua false boolean', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.eval('return false', 0)
				.then(function(reply) {
					should.not.exist(reply);
				});
		});

		it('should evaluate Lua status code', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.eval('return {ok=\'fine\'}', 0)
				.then(function(reply) {
					reply.should.equal('fine');
				});
		});

		it('should evaluate Lua error', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.eval('return {err=\'this is an error\'}', 0)
				.catch(function(err) {
					err.should.deep.equal(new Error('this is an error'));
				});
		});

		it('should evaluate Lua table', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.eval('return {1,2,3,\'ciao\',{1,2}}', 0)
				.then(function(reply) {
					Array.isArray(reply).should.equal(true);
					reply.length.should.equal(5);
					reply.should.deep.equal([1, 2, 3, 'ciao', [1, 2]]);
				});
		});

		it('should evaluate KEYS and ARGS arrays', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.eval('return {KEYS[1],KEYS[2],ARGV[1],ARGV[2]}', 2, 'a', 'b', 'c', 'd')
				.then(function(reply) {
					Array.isArray(reply).should.equal(true);
					reply.length.should.equal(4);
					reply.should.deep.equal(['a', 'b', 'c', 'd']);
				});
		});

		it('should evaluate params in array format', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.eval(['return {KEYS[1],KEYS[2],ARGV[1],ARGV[2]}', 2, 'a', 'b', 'c', 'd'])
				.then(function(reply) {
					Array.isArray(reply).should.equal(true);
					reply.length.should.equal(4);
					reply.should.deep.equal(['a', 'b', 'c', 'd']);
				});
		});

		it('should handle EVALSHA', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			var source = 'return redis.call(\'get\', \'sha test\')',
				sha = crypto.createHash('sha1').update(source).digest('hex');

			return client.set('sha test', 'eval get sha test')
				.then(function(reply) {
					reply.should.equal('OK');
					return client.eval(source, 0);
				})
				.then(function(reply) {
					reply.should.equal('eval get sha test');
					return client.evalsha(sha, 0);
				})
				.then(function(reply) {
					reply.should.equal('eval get sha test');
					return client.evalsha('ffffffffffffffffffffffffffffffffffffffff', 0);
				})
				.then(function(reply) {
					should.not.exist(reply);
					false.should.equal(true);
				})
				.catch(function(err) {
					should.exist(err);
					err.should.be.instanceof(Error);
				});
		});

		it('should handle Redis int to Lua type conversion', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.set('incr key', 0)
				.then(function(reply) {
					reply.should.equal('OK');
					return client.eval('local foo = redis.call(\'incr\',\'incr key\')\n' + 'return {type(foo),foo}', 0);
				})
				.then(function(reply) {
					Array.isArray(reply).should.equal(true);
					reply.length.should.equal(2);
					reply.should.deep.equal(['number', 1]);
				});
		});

		it('should handle Redis bulk to Lua type conversion', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.set('bulk reply key', 'bulk reply value')
				.then(function(reply) {
					reply.should.equal('OK');
					return client.eval('local foo = redis.call(\'get\',\'bulk reply key\'); return {type(foo),foo}', 0);
				})
				.then(function(reply) {
					Array.isArray(reply).should.equal(true);
					reply.length.should.equal(2);
					reply.should.deep.equal(['string', 'bulk reply value']);
				});
		});

		it('should handle Redis multi bulk to Lua type conversion', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.multi()
				.del('mylist')
				.rpush('mylist', 'a')
				.rpush('mylist', 'b')
				.rpush('mylist', 'c')
				.exec()
				.then(function(replies) {
					Array.isArray(replies).should.equal(true);
					replies.length.should.equal(4);
					return client.eval('local foo = redis.call(\'lrange\',\'mylist\',0,-1); return {type(foo),foo[1],foo[2],foo[3],# foo}', 0);
				})
				.then(function(replies) {
					Array.isArray(replies).should.equal(true);
					replies.length.should.equal(5);
					replies.should.deep.equal(['table', 'a', 'b', 'c', 3]);
				});
		});

		it('should handle Redis status reply to Lua type conversion', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.eval('local foo = redis.call(\'set\',\'mykey\',\'myval\'); return {type(foo),foo[\'ok\']}', 0)
				.then(function(reply) {
					Array.isArray(reply).should.equal(true);
					reply.length.should.equal(2);
					reply.should.deep.equal(['table', 'OK']);
				});
		});

		it('should handle Redis error reply to Lua type conversion', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.set('error reply key', 'error reply value')
				.then(function(reply) {
					reply.should.equal('OK');
					return client.eval('local foo = redis.pcall(\'incr\',\'error reply key\'); return {type(foo),foo[\'err\']}', 0);
				})
				.then(function(reply) {
					Array.isArray(reply).should.equal(true);
					reply.length.should.equal(2);
					reply.should.deep.equal(['table', 'ERR value is not an integer or out of range']);
				});
		});

		it('should handle Redis nil bulk reply to Lua type conversion', function() {
			if (!checkMinServerVersion([2, 6, 0])) {
				console.log('Skipping for old Redis server version < 2.6.0');
				return false;
			}

			return client.del('nil reply key')
				.then(function(reply) {
					reply.should.equal(0);
					return client.eval('local foo = redis.call(\'get\',\'nil reply key\'); return {type(foo),foo == false}', 0);
				})
				.then(function(reply) {
					Array.isArray(reply).should.equal(true);
					reply.length.should.equal(2);
					reply.should.deep.equal(['boolean', 1]);
				});
		});
	});
});

describe('test pubsub', function() {
	var client, client2;

	beforeEach(function(done) {
		var ready = false;

		client = redis.createClient(PORT, HOST);
		client2 = redis.createClient(PORT, HOST);

		client.once('ready', function() {
			if (ready) {
				done();
			} else {
				ready = true;
			}
		});

		client2.once('ready', function() {
			if (ready) {
				done();
			} else {
				ready = true;
			}
		});
	});

	afterEach(function(done) {
		if (client) {
			client.quit();
		}
		if (client2) {
			client2.quit();
		}
		client = null;
		client2 = null;
		done();
	});

	it('should forward forced errors', function(done) {
		var subchannel = 'forced_errors';

		var toThrow = new Error('Forced exception');

		client2.removeAllListeners('error');
		client2.once('error', function(err) {
			err.should.equal(toThrow);
			done();
		});

		client2.on('message', function(channel, data) {
			if (channel === subchannel) {
				data.should.equal('Some message');
				throw toThrow;
			}
		});
		client2.subscribe(subchannel);

		client.publish(subchannel, 'Some message');
	});
});

describe('script load', function() {
	var client;

	beforeEach(function(done) {
		client = redis.createClient(PORT, HOST, {
			returnBuffers: true
		});

		client.once('ready', function() {
			done();
		});
	});

	afterEach(function(done) {
		if (client) {
			client.quit();
		}
		client = null;
		done();
	});

	it('should handle loaded scripts', function() {
		if (!checkMinServerVersion([2, 6, 0])) {
			console.log('Skipping for old Redis server version < 2.6.0');
			return false;
		}

		var command = 'return 1',
			commandSha = crypto.createHash('sha1').update(command).digest('hex');

		return client.script('load', command)
			.then(function(reply) {
				reply.should.equal(commandSha);

				return client.multi()
					.script('load', command)
					.exec();
			})
			.then(function(replies) {
				Array.isArray(replies).should.equal(true);
				replies.length.should.equal(1);
				replies[0].should.equal(commandSha);

				return client.multi([
						['script', 'load', command]
					])
					.exec();
			})
			.then(function(replies) {
				Array.isArray(replies).should.equal(true);
				replies.length.should.equal(1);
				replies[0].should.equal(commandSha);
			});
	});
});
