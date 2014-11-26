'use strict';

var net = require('net');
var Client = require('./lib/client');

var DEFAULT_PORT = 6379;
var DEFAULT_HOST = '127.0.0.1';
var FAMILY_IPV6 = 6;
var FAMILY_IPV4 = 4;

function createClientUnix(path, options) {
  var cnxOptions = {
    path: path
  };
  var netClient = net.createConnection(cnxOptions);
  var redisClient = new Client(netClient, options || {});

  redisClient.connectionOption = cnxOptions;
  redisClient.address = path;

  return redisClient;
}

function createClientTcp(port, host, options) {
  var cnxOptions = {
    'port': port || DEFAULT_PORT,
    'host': host || DEFAULT_HOST,
    'family': options && options.family === 'IPv6' ? FAMILY_IPV6 : FAMILY_IPV4
  };
  var netClient = net.createConnection(cnxOptions);
  var redisClient = new Client(netClient, options || {});

  redisClient.connectionOption = cnxOptions;
  redisClient.address = cnxOptions.host + ':' + cnxOptions.port;

  return redisClient;
}

exports.createClient = function createClient(arg0, arg1, arg2) {
  if (!arguments.length) {

    // createClient()
    return createClientTcp(DEFAULT_PORT, DEFAULT_HOST, {});

  } else if (typeof arg0 === 'number' ||
    typeof arg0 === 'string' && arg0.match(/^\d+$/)) {

    // createClient( 3000, host, options)
    // createClient('3000', host, options)
    return createClientTcp(arg0, arg1, arg2);

  } else if (typeof arg0 === 'string') {

    // createClient( '/tmp/redis.sock', options)
    return createClientUnix(arg0, arg1);

  } else if (arg0 !== null && typeof arg0 === 'object') {

    // createClient(options)
    return createClientTcp(DEFAULT_PORT, DEFAULT_HOST, arg0);

  } else if (arg0 === null && arg1 === null) {

    // for backward compatibility
    // createClient(null,null,options)
    return createClientTcp(DEFAULT_PORT, DEFAULT_HOST, arg2);

  } else {
    throw new Error('unknown type of connection in createClient()');
  }
};
