/* global Buffer */
'use strict';

var Promise = require('bluebird');

function Command(command) {
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

	self.args = args;

	self.promise = new Promise(function commandPromise(resolve, reject) {
		self.resolve = resolve;
		self.reject = reject;
	}).nodeify(callback);
}

Command.prototype.write = function writeCommand() {
	var elemCount = this.args.length + 1,
		writes = [];
	var i, il, arg;

	// Always use 'Multi bulk commands', but if passed any Buffer args, then do multiple writes, one for each arg.
	// This means that using Buffers in commands is going to be slower, so use Strings if you don't already have a Buffer.

	var commandStr = '*' + elemCount + '\r\n$' + this.command.length + '\r\n' + this.command + '\r\n';

	if (!this.bufferArgs) { // Build up a string and send entire command in one write
		for (i = 0, il = this.args.length, arg; i < il; i += 1) {
			arg = this.args[i];
			if (typeof arg !== 'string') {
				arg = String(arg);
			}
			commandStr += '$' + Buffer.byteLength(arg) + '\r\n' + arg + '\r\n';
		}

		writes.push(commandStr);
	} else {
		writes.push(commandStr);

		for (i = 0, il = this.args.length, arg; i < il; i += 1) {
			arg = this.args[i];
			if (!(Buffer.isBuffer(arg) || arg instanceof String)) {
				arg = String(arg);
			}

			if (Buffer.isBuffer(arg)) {
				if (arg.length === 0) {
					writes.push('$0\r\n\r\n');
				} else {
					writes.push('$' + arg.length + '\r\n');
					writes.push(arg);
					writes.push('\r\n');

				}
			} else {
				writes.push('$' + Buffer.byteLength(arg) + '\r\n' + arg + '\r\n');
			}
		}
	}

  return writes;
};

Command.prototype.resolve = function resolveCommand() {
	var self = this;

	process.nextTick(function nextTickResolve() {
		self.resolve(arguments);
	});
};

Command.prototype.reject = function rejectCommand(e) {
	var self = this;

	process.nextTick(function nextTickReject() {
		self.reject(e);
	});
};

module.exports = Command;
