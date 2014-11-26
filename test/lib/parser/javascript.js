/* global describe, it, beforeEach, afterEach */
/* eslint-disable func-names */

var redis = require('../../../index');

var HOST = '127.0.0.1';
var PORT = 6379;

describe('javascript parser', function() {
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

  it('should handle wire-protocol writes', function(done) {
    if (client.replyParser.name !== 'javascript') {
      console.log('Skipping wire-protocol test for 3rd-party parser');
      return done();
    }

    var p = require('../../../lib/parser/javascript');
    var parser = new p.Parser(false);
    var replyCount = 0;
    function checkReply(reply) {
      reply.should.deep.equal([['a']]);

      replyCount++;

      if (replyCount === 3) {
        done();
      }
    }
    parser.on('reply', checkReply);

    parser.execute(new Buffer('*1\r\n*1\r\n$1\r\na\r\n'));

    parser.execute(new Buffer('*1\r\n*1\r'));
    parser.execute(new Buffer('\n$1\r\na\r\n'));

    parser.execute(new Buffer('*1\r\n*1\r\n'));
    parser.execute(new Buffer('$1\r\na\r\n'));
  });
});
