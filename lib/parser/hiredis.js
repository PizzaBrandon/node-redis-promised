var events = require('events'),
    util = require('util'),
    hiredis = require('hiredis');

exports.name = 'hiredis';

function HiredisReplyParser(options) {
    this.name = exports.name;
    this.options = options || {};
    this.reset();
    events.EventEmitter.call(this);
}

util.inherits(HiredisReplyParser, events.EventEmitter);

exports.Parser = HiredisReplyParser;

HiredisReplyParser.prototype.reset = function reset() {
    this.reader = new hiredis.Reader({
        returnBuffers: this.options.returnBuffers || false
    });
};

HiredisReplyParser.prototype.execute = function execute(data) {
    var reply;
    this.reader.feed(data);
    /* eslint-disable no-constant-condition */
    while (true) {
    /* eslint-enable no-constant-condition */
        try {
            reply = this.reader.get();
        } catch (err) {
            this.emit('error', err);
            break;
        }

        if (reply === undefined) {
            break;
        }

        if (reply && reply.constructor === Error) {
            this.emit('error', reply);
        } else {
            this.emit('reply', reply);
        }
    }
};
