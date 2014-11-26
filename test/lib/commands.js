/* global describe, it, beforeEach, afterEach */
/* eslint-disable func-names */

var redis = require('../../index');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
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
