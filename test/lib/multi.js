/* global describe, it, before, after, afterEach */
/* eslint-disable func-names */

var redis = require('../../index');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var should = chai.should();
chai.use(chaiAsPromised);

var HOST = '127.0.0.1';
var PORT = 6379;

var serverVersion;

function checkMinServerVersion(desiredVersion) {
	var match = !!serverVersion;

	for (var i = 0; i < 3 && match; i++) {
		match &= serverVersion[i] >= desiredVersion[i];
	}
	return match;
}

describe('test redis multi commands', function() {
	var client;

	before(function(done) {
		client = redis.createClient(PORT, HOST);
		client.once('ready', function() {
			serverVersion = client.serverInfo.versions;
			done();
		});
	});

	afterEach(function(done) {
		client.flushdb(done);
	});

	after(function(done) {
		if (client) {
			client.quit();
		}
		client = null;
		done();
	});

	describe('command list', function() {

		it('throws on bad sub-command', function() {
			var multi = client.multi();

			multi.mset('multifoo', 10, 'multibar', 20);
			multi.set('foo2'); // This is the bad command
			multi.incr('multifoo');
			multi.incr('multibar');
			return multi.exec()
				.then(function(reply) {
					// This shouldn't happen
					should.not.exist(reply);
					false.should.equal(true);
				})
				.catch(function(err) {
					should.exist(err);
					err.should.deep.equal(new Error('ERR wrong number of arguments for \'set\' command'));

					return client.get('multifoo');
				})
				.then(function(reply) {
					if (checkMinServerVersion([2, 6, 5])) {
						// Redis 2.6.5+ will abort transactions with errors
						// see: http://redis.io/topics/transactions
						should.not.exist(reply);
					} else {
						reply.should.equal(11);
					}
				});
		});

		it('completes when no errors', function() {
			var multi = client.multi();

			multi.mset('multifoo', 10, 'multibar', 20);
			multi.incr('multifoo');
			multi.incr('multibar');
			return multi.exec()
				.then(function(replies) {
					Array.isArray(replies).should.equal(true);
					replies.length.should.equal(3);

					replies.should.deep.equal(['OK', 11, 21]);
				});
		});
	});

	describe('bulk call', function() {

		it('throws on bad sub-command', function() {
			return client.multi([
					['mset', 'multifoo', 10, 'multibar', 20],
					['set', 'foo2'],
					['incr', 'multifoo'],
					['incr', 'multibar']
				])
				.exec()
				.catch(function(err) {
					should.exist(err);
					err.should.deep.equal(new Error('ERR wrong number of arguments for \'set\' command'));

					return client.get('multifoo');
				})
				.then(function(reply) {
					if (checkMinServerVersion([2, 6, 5])) {
						// Redis 2.6.5+ will abort transactions with errors
						// see: http://redis.io/topics/transactions
						should.not.exist(reply);
					} else {
						reply.should.equal(11);
					}
				});
		});

		it('completes when no errors', function() {
			return client.multi([
					['mset', 'multifoo', 10, 'multibar', 20],
					['incr', 'multifoo'],
					['incr', 'multibar'],
					['mget', 'multifoo', 'multibar']
				])
				.exec()
				.then(function(replies) {
					Array.isArray(replies).should.equal(true);
					replies.length.should.equal(4);

					replies.should.deep.equal(['OK', 11, 21, ['11', '21']]);
				});
		});

		it('handles nested bulk replies', function() {
			return client.multi([
					['mget', ['multifoo', 'some', 'random value', 'keys']],
					['incr', 'multifoo']
				])
				.exec()
				.then(function(replies) {
					Array.isArray(replies).should.equal(true);
					replies.length.should.equal(2);

					Array.isArray(replies[0]).should.equal(true);
					replies[0].length.should.equal(4);
				});
		});
	});

	describe('chained calls', function() {

		it('throws on bad sub-command', function() {
			return client.multi()
				.mset('multifoo', 10, 'multibar', 20)
				.set('foo2')
				.incr('multifoo')
				.incr('multibar')
				.exec()
				.catch(function(err) {
					should.exist(err);
					err.should.deep.equal(new Error('ERR wrong number of arguments for \'set\' command'));

					return client.get('multifoo');
				})
				.then(function(reply) {
					if (checkMinServerVersion([2, 6, 5])) {
						// Redis 2.6.5+ will abort transactions with errors
						// see: http://redis.io/topics/transactions
						should.not.exist(reply);
					} else {
						reply.should.equal(11);
					}
				});
		});

		it('completes when no errors', function() {
			return client.multi()
				.mset('some', '10', 'keys', '20')
				.incr('some')
				.incr('keys')
				.mget('some', 'keys')
				.exec()
				.then(function(replies) {
					Array.isArray(replies).should.equal(true);
					replies.length.should.equal(4);

					replies.should.deep.equal(['OK', 11, 21, ['11', '21']]);
				});
		});

		it('calls callback on complete', function() {
			return client.multi()
				.mset('some', '10', 'keys', '20')
				.incr('some')
				.incr('keys')
				.mget('some', 'keys')
				.exec(function(err, replies) {
					should.not.exist(err);
					Array.isArray(replies).should.equal(true);
					replies.length.should.equal(4);

					replies.should.deep.equal(['OK', 11, 21, ['11', '21']]);
				});
		});
	});

	it('successfully completes hash commands', function() {
		return client.multi()
			.hmset('multihash', 'a', 'foo', 'b', 1)
			.hmset('multihash', {
				extra: 'fancy',
				things: 'here'
			})
			.hget('multihash', 'b')
			.hmget('multihash', 'a', 'extra')
			.hgetall('multihash')
			.exec()
			.then(function(replies) {
				Array.isArray(replies).should.equal(true);
				replies.length.should.equal(5);

				replies.should.deep.equal(['OK', 'OK', '1', ['foo', 'fancy'],
					['a', 'foo', 'b', '1', 'extra', 'fancy', 'things', 'here']]);
			});
	});

	describe('set manipulation commands', function() {
		before(function(done) {
			client.sadd('some set', 'mem 1', 'mem 2', 'mem 3', 'mem 4')
				.finally(done);
		});

		it('successfully returns', function() {
			return client.multi([
					['smembers', 'some set'],
					['del', 'some set'],
					['smembers', 'some set'],
					['smembers', 'some missing set']
				])
				.scard('some set')
				.exec()
        .then(function(replies) {
          Array.isArray(replies).should.equal(true);
          replies.length.should.equal(5);

          replies[0].length.should.equal(4);
          replies[1].should.equal(1);
          replies[2].should.deep.equal([]);
          replies[3].should.deep.equal([]);
          replies[4].should.equal(0);
				});
		});
	});
});
