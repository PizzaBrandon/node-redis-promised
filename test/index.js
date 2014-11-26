/* global describe, it, afterEach */
/* eslint-disable func-names */

var redis = require('../index');

var HOST = '127.0.0.1';
var HOST_IPV6 = '::1';
var PORT = 6379;
var TEST_SOCKET = '/tmp/redis.sock';

var serverVersion;

function checkMinServerVersion(desiredVersion) {
	var match = !!serverVersion;

	for (var i = 0; i < 3 && match; i++) {
		match &= serverVersion[i] >= desiredVersion[i];
	}
	return match;
}

describe('test client connectivity', function() {
	var client;

	afterEach(function(done) {
		if (client) {
			client.quit();
		}
		client = null;
		done();
	});

	it('should connect correctly over IPV4', function(done) {
		client = redis.createClient(PORT, HOST, {
			'family': 'IPv4'
		});

		client.once('ready', function testConnectivity() {
			console.log('Connected to ' + client.address + ', Redis server version ' + client.serverInfo.redis_version + '\n');
			console.log('Using reply parser ' + client.replyParser.name);

			serverVersion = client.serverInfo.versions;

			done();
		});

		client.on('end', function() {
      // Do nothing
		});

		// Exit immediately on connection failure, which triggers 'exit', below, which fails the test
		client.on('error', function(err) {
			console.error('client: ' + err.stack);
			throw err;
		});
	});

	it('should connect correctly over IPV6', function(done) {
		if (!checkMinServerVersion([2, 8, 0])) {
			console.log('Skipping IPV6 for old Redis server version < 2.8.0');
			done();
		}

		client = redis.createClient(PORT, HOST_IPV6, {
			'family': 'IPv6'
		});

		client.once('ready', function testConnectivity() {
			console.log('Connected to ' + client.address + ', Redis server version ' + client.serverInfo.redis_version + '\n');
			console.log('Using reply parser ' + client.replyParser.name);

			done();
		});

		client.on('end', function() {
      // Do nothing
		});

		// Exit immediately on connection failure, which triggers 'exit', below, which fails the test
		client.on('error', function(err) {
			console.error('client: ' + err.stack);
			throw err;
		});
	});

	it('should connect correctly over Unix socket', function(done) {
		client = redis.createClient(TEST_SOCKET);

		// if this fails, check the permission of unix socket.
		// unixsocket /tmp/redis.sock
		// unixsocketperm 777

		client.once('ready', function testConnectivity() {
			console.log('Connected to ' + client.address + ', Redis server version ' + client.serverInfo.redis_version + '\n');
			console.log('Using reply parser ' + client.replyParser.name);

			done();
		});

		client.on('end', function() {
      // Do nothing
		});

		// Exit immediately on connection failure, which triggers 'exit', below, which fails the test
		client.on('error', function(err) {
			console.error('client: ' + err.stack);
			throw err;
		});
	});
});
