redis-promised - a node.js redis client with promise support
===========================

This is a complete promise-ready Redis client for node.js based on [mranney/node_redis](https://github.com/mranney/node_redis). It supports all Redis commands. This library adds promise support while also maintaining the original callback support.

Install with:

    npm install redis-promised

Pieter Noordhuis has provided a binding to the official `hiredis` C library, which is non-blocking and fast. To use `hiredis`, do:

    npm install hiredis redis-promised

If `hiredis` is installed, `redis-promised` will use it by default. Otherwise, a pure JavaScript parser will be used.

If you use `hiredis`, be sure to rebuild it whenever you upgrade your version of node. There are mysterious failures that can happen between node and native code modules after a node upgrade.


## Usage

TODO: Update with promise and callback examples


### Sending Commands

Each Redis command is exposed as a function on the `client` object. All functions take either an `args` array plus optional `callback` function or a variable number of individual arguments followed by an optional callback. All Redis commands also return a promise that will be resolved with the result of the command (or rejected if the command errors).

Here is an example of sending multiple arguments and handling the promise:

```js
client.mset('test 1', 'test val 1', 'test 2', 'test val 2')
    .then(function(reply) {
        // Do something with the reply
    })
    .catch(function(err) {
        // Handle an exception
    });
```

Here is an example of passing an array of arguments and a callback:

```js
client.mset(["test keys 1", "test val 1", "test keys 2", "test val 2"], function (err, res) {});
```

Here is that same call in the second style:

```js
client.mset("test keys 1", "test val 1", "test keys 2", "test val 2", function (err, res) {});
```

Note that in either form the `callback` is optional:

```js
client.set("some key", "some val");
client.set(["some other key", "some val"]);
```

If the key is missing, reply will be null (probably):

```js
client.get("missingkey", function(err, reply) {
    // reply is null when the key is missing
    console.log(reply);
});
```

For a list of Redis commands, see the [Redis Command Reference](http://redis.io/commands).

The commands can be specified in uppercase or lowercase for convenience. `client.get()` is the same as `client.GET()`.

Minimal parsing is done on the replies. Commands that return a single line reply return JavaScript Strings, integer replies return JavaScript Numbers, "bulk" replies return node Buffers, and "multi bulk" replies return a JavaScript Array of node Buffers. `HGETALL` returns an Object with Buffers keyed by the hash keys.

# API

## Connection Events

`client` will emit some events about the state of the connection to the Redis server.

### "ready"

`client` will emit `ready` a connection is established to the Redis server and the server reports that it is ready to receive commands.  Commands issued before the `ready` event are queued, then replayed just before this event is emitted.

### "connect"

`client` will emit `connect` at the same time as it emits `ready` unless `client.options.noReadyCheck` is set. If this options is set, `connect` will be emitted when the stream is connected, and then you are free to try to send commands.

### "error"

`client` will emit `error` when encountering an error connecting to the Redis server.

Note that "error" is a special event type in node. If there are no listeners for an "error" event, node will exit. This is usually what you want, but it can lead to some cryptic error messages like this:

    mjr:~/work/node_redis (master)$ node example.js

    node.js:50
        throw e;
        ^
    Error: ECONNREFUSED, Connection refused
        at IOWatcher.callback (net:870:22)
        at node.js:607:9

Not very useful in diagnosing the problem, but if your program isn't ready to handle this, it is probably the right thing to just exit.

`client` will also emit `error` if an exception is thrown inside of `redis-promised` for whatever reason. It would be nice to distinguish these two cases.

### "end"

`client` will emit `end` when an established Redis server connection has closed.

### "drain"

`client` will emit `drain` when the TCP connection to the Redis server has been buffering, but is now writable. This event can be used to stream commands in to Redis and adapt to backpressure. Right now, you need to check `client.commandQueue.length` to decide when to reduce your send rate. Then you can resume sending when you get `drain`.

### "idle"

`client` will emit `idle` when there are no outstanding commands that are awaiting a response.

## redis.createClient()

### overloading
* redis.createClient() == redis.createClient(6379, '127.0.0.1', {})
* redis.createClient(options) == redis.createClient(6379, '127.0.0.1', options)
* redis.createClient(unix_socket, options)
* redis.createClient(port, host, options)

If you have `redis-server` running on the same computer as node, then the defaults for port and host are probably fine. `options` in an object with the following possible properties:

* `parser`: which Redis protocol reply parser to use. Defaults to `hiredis` if that module is installed. This may also be set to `javascript`.

* `returnBuffers`: defaults to `false`. If set to `true`, then all replies will be sent to callbacks as node Buffer objects instead of JavaScript Strings.

* `detectBuffers`: default to `false`. If set to `true`, then replies will be sent to callbacks as node Buffer objects if any of the input arguments to the original command were Buffer objects. This option lets you switch between Buffers and Strings on a per-command basis, whereas `returnBuffers` applies to every command on a client.

* `socketNoDelay`: defaults to `true`. Whether to call setNoDelay() on the TCP stream, which disables the Nagle algorithm on the underlying socket. Setting this option to `false` can result in additional throughput at the cost of more latency. Most applications will want this set to `true`.

* `socketKeepAlive` defaults to `true`. Whether the keep-alive functionality is enabled on the underlying socket.

* `noReadyCheck`: defaults to `false`. When a connection is established to the Redis server, the server might still be loading the database from disk. While loading, the server not respond to any commands. To work around this, `redis-promised` has a "ready check" which sends the `INFO` command to the server. The response from the `INFO` command indicates whether the server is ready for more commands. When ready, `redis-promised` emits a `ready` event. Setting `noReadyCheck` to `true` will inhibit this check.

* `enableOfflineQueue`: defaults to `true`. By default, if there is no active connection to the redis server, commands are added to a queue and are executed once the connection has been established. Setting `enableOfflineQueue` to `false` will disable this feature and the callback will be execute immediately with an error, or an error will be thrown if no callback is specified.

* `retryMaxDelay`: defaults to `null`. By default every time the client tries to connect and fails time before reconnection (delay) almost doubles. This delay normally grows infinitely, but setting `retryMaxDelay` limits delay to maximum value, provided in milliseconds.

* `connectTimeout` defaults to `false`. By default client will try reconnecting until connected. Setting `connectTimeout` limits total time for client to reconnect. Value is provided in milliseconds and is counted once the disconnect occurred.

* `maxAttempts` defaults to `null`. By default client will try reconnecting until connected. Setting `maxAttempts` limits total amount of reconnects.

* `authPass` defaults to `null`. By default client will try connecting without auth. If set, client will run redis auth command on connect.

* `family` defaults to `IPv4`. The client connects in IPv4 if not specified or if the DNS resolution returns an IPv4 address. You can force an IPv6 if you set the family to 'IPv6'. See node net or dns modules how to use the family type.

```js
var redis = require("redis-promised"),
    client = redis.createClient({detectBuffers: true});

client.set("foo_rand000000000000", "OK");

// This will return a JavaScript String
client.get("foo_rand000000000000", function (err, reply) {
    console.log(reply.toString()); // Will print `OK`
});

// This will return a Buffer since original key is specified as a Buffer
client.get(new Buffer("foo_rand000000000000"), function (err, reply) {
    console.log(reply.toString()); // Will print `<Buffer 4f 4b>`
});
client.end();
```

`createClient()` returns a `RedisClient` object that is named `client` in all of the examples here.


## client.auth(password, [callback])

When connecting to Redis servers that require authentication, the `AUTH` command must be sent as the first command after connecting. This can be tricky to coordinate with reconnections, the ready check, etc. To make this easier, `client.auth()` stashes `password` and will send it after each connection, including reconnections. `callback`, if defined, is invoked only once, after the response to the very first `AUTH` command sent.

**NOTE:** Your call to `client.auth()` should not be inside the ready handler. If you are doing this wrong, `client` will emit an error that looks something like this `Error: Ready check failed: ERR operation not permitted`.

## client.end()

Forcibly close the connection to the Redis server. Note that this does not wait until all replies have been parsed. If you want to exit cleanly, call `client.quit()` to send the `QUIT` command after you have handled all replies.

This example closes the connection to the Redis server before the replies have been read. You probably don't want to do this:

```js
var redis = require("redis-promised"),
    client = redis.createClient();

client.set("foo_rand000000000000", "some fantastic value");
client.get("foo_rand000000000000", function (err, reply) {
    console.log(reply.toString());
});
client.end();
```

`client.end()` is useful for timeout cases where something is stuck or taking too long and you want to start over.

## client.unref()

Call `unref()` on the underlying socket connection to the Redis server, allowing the program to exit once no more commands are pending.

This is an **experimental** feature, and only supports a subset of the Redis protocol. Any commands where client state is saved on the Redis server, e.g. `*SUBSCRIBE` or the blocking `BL*` commands will *NOT* work with `.unref()`.

```js
var redis = require("redis-promised");
var client = redis.createClient();

// Calling unref() will allow this program to exit immediately after the get command finishes. Otherwise the client would hang as long as the client-server connection is alive.

client.unref();
client.get("foo", function (err, value){
    if (err) throw(err);
    console.log(value);
});
```

## Friendlier hash commands

Most Redis commands take a single String or an Array of Strings as arguments, and replies are sent back as a single String or an Array of Strings. When dealing with hash values, there are a couple of useful exceptions to this.

### client.hgetall(hash)

The reply from an HGETALL command will be converted into a JavaScript Object by `redis-promised`. That way you can interact with the responses using JavaScript syntax.

Example:

```js
client.hmset("hosts", "mjr", "1", "another", "23", "home", "1234");
client.hgetall("hosts", function (err, obj) {
    console.dir(obj);
});
```

Output:

```js
{ mjr: '1', another: '23', home: '1234' }
```

### client.hmset(hash, obj, [callback])

Multiple values in a hash can be set by supplying an object:

```js
client.HMSET(key2, {
    "0123456789": "abcdefghij", // NOTE: key and value will be coerced to strings
    "some manner of key": "a type of value"
});
```

The properties and values of this Object will be set as keys and values in the Redis hash.

### client.hmset(hash, key1, val1, ... keyn, valn, [callback])

Multiple values may also be set by supplying a list:

```js
client.HMSET(key1, "0123456789", "abcdefghij", "some manner of key", "a type of value");
```


## Publish / Subscribe

Here is a simple example of the API for publish / subscribe. This program opens two client connections, subscribes to a channel on one of them, and publishes to that channel on the other:

```js
var redis = require("redis-promises"),
    client1 = redis.createClient(),
    client2 = redis.createClient(),
    msg_count = 0;

client1.on("subscribe", function (channel, count) {
    client2.publish("a nice channel", "I am sending a message.");
    client2.publish("a nice channel", "I am sending a second message.");
    client2.publish("a nice channel", "I am sending my last message.");
});

client1.on("message", function (channel, message) {
    console.log("client1 channel " + channel + ": " + message);
    msg_count += 1;
    if (msg_count === 3) {
        client1.unsubscribe();
        client1.end();
        client2.end();
    }
});

client1.incr("did a thing");
client1.subscribe("a nice channel");
```

When a client issues a `SUBSCRIBE` or `PSUBSCRIBE`, that connection is put into a "subscriber" mode. At that point, only commands that modify the subscription set are valid. When the subscription set is empty, the connection is put back into regular mode.

If you need to send regular commands to Redis while in subscriber mode, just open another connection.

## Subscriber Events

If a client has subscriptions active, it may emit these events:

### "message" (channel, message)

Client will emit `message` for every message received that matches an active subscription. Listeners are passed the channel name as `channel` and the message Buffer as `message`.

### "pmessage" (pattern, channel, message)

Client will emit `pmessage` for every message received that matches an active subscription pattern. Listeners are passed the original pattern used with `PSUBSCRIBE` as `pattern`, the sending channel name as `channel`, and the message Buffer as `message`.

### "subscribe" (channel, count)

Client will emit `subscribe` in response to a `SUBSCRIBE` command.  Listeners are passed the channel name as `channel` and the new count of subscriptions for this client as `count`.

### "psubscribe" (pattern, count)

Client will emit `psubscribe` in response to a `PSUBSCRIBE` command.  Listeners are passed the original pattern as `pattern`, and the new count of subscriptions for this client as `count`.

### "unsubscribe" (channel, count)

Client will emit `unsubscribe` in response to a `UNSUBSCRIBE` command.  Listeners are passed the channel name as `channel` and the new count of subscriptions for this client as `count`. When `count` is 0, this client has left subscriber mode and no more subscriber events will be emitted.

### "punsubscribe" (pattern, count)

Client will emit `punsubscribe` in response to a `PUNSUBSCRIBE` command. Listeners are passed the channel name as `channel` and the new count of subscriptions for this client as `count`. When `count` is 0, this client has left subscriber mode and no more subscriber events will be emitted.

## client.multi([commands])

`client.multi()` is a constructor that returns a `Multi` object.  `Multi` objects share all of the same command methods as `client` objects do. Commands are queued up inside the `Multi` object until `Multi.exec()` is invoked. All the commands can be queued at once in an array of arguments, as a chain of commands, or queued individually.

```js
var redis = require("redis-promised"),
    client = redis.createClient(), set_size = 20;

client.sadd("bigset", "a member");
client.sadd("bigset", "another member");

while (set_size > 0) {
    client.sadd("bigset", "member " + set_size);
    set_size -= 1;
}

// multi chain with an individual callback
client.multi()
    .scard("bigset")
    .smembers("bigset")
    .keys("*", function (err, replies) {
        // NOTE: code in this callback is NOT atomic
        // this only happens after the the .exec call finishes.
        client.mget(replies, redis.print);
    })
    .dbsize()
    .exec(function (err, replies) {
        console.log("MULTI got " + replies.length + " replies");
        replies.forEach(function (reply, index) {
            console.log("Reply " + index + ": " + reply.toString());
        });
    });
```

### Multi.exec([callback])

`Multi.exec()` will send all the commands queued in a `Multi` object and return an array of the results of the queued commands. If an error occurs in any of the queued commands, `exec()` will reject with the error. In Redis versions beyond 2.6.5, the executed commands will be rolled back; in earlier versions, all successful commands are committed.

You can either chain together `MULTI` commands as in the above example, or you can queue individual commands while still sending regular client command as in this example:

```js
var redis = require("redis-promised"),
    client = redis.createClient(), multi;

// start a separate multi command queue
multi = client.multi();
multi.incr("incr thing", redis.print);
multi.incr("incr other thing", redis.print);

// runs immediately
client.mset("incr thing", 100, "incr other thing", 1, redis.print);

// drains multi queue and runs atomically
multi.exec(function (err, replies) {
    console.log(replies); // 101, 2
});

// you can re-run the same transaction if you like
multi.exec(function (err, replies) {
    console.log(replies); // 102, 3
    client.quit();
});
```

In addition to adding commands to the `MULTI` queue individually, you can also pass an array of commands and arguments to the constructor:

```js
var redis = require("redis-promised"),
    client = redis.createClient(), multi;

client.multi([
    ["mget", "multifoo", "multibar", redis.print],
    ["incr", "multifoo"],
    ["incr", "multibar"]
]).exec(function (err, replies) {
    console.log(replies);
});
```


## Monitor mode

Redis supports the `MONITOR` command, which lets you see all commands received by the Redis server across all client connections, including from other client libraries and other computers.

After you send the `MONITOR` command, no other commands are valid on that connection. `redis-promised` will emit a `monitor` event for every new monitor message that comes across. The callback for the `monitor` event takes a timestamp from the Redis server and an array of command arguments.

Here is a simple example:

```js
var client = require("redis-promised").createClient(),
    util = require("util");

client.monitor(function (err, res) {
    console.log("Entering monitoring mode.");
});

client.on("monitor", function (time, args) {
    console.log(time + ": " + util.inspect(args));
});
```

# Extras

Some other things you might like to know about.

## client.serverInfo

After the ready probe completes, the results from the INFO command are saved in the `client.serverInfo` object.

The `versions` key contains an array of the elements of the version string for easy comparison.

    > client.serverInfo.redis_version
    '2.3.0'
    > client.serverInfo.versions
    [ 2, 3, 0 ]

## redis.print()

A handy callback function for displaying return values when testing.  Example:

```js
var redis = require("redis-promised"),
    client = redis.createClient();

client.on("connect", function () {
    client.set("foo_rand000000000000", "some fantastic value", redis.print);
    client.get("foo_rand000000000000", redis.print);
});
```

This will print:

    Reply: OK
    Reply: some fantastic value

Note that this program will not exit cleanly because the client is still connected.

## Multi-word commands

To execute redis multi-word commands like `SCRIPT LOAD` or `CLIENT LIST` pass
the second word as first parameter:

```js
client.script('load', 'return 1');
client.multi().script('load', 'return 1').exec(...);
client.multi([['script', 'load', 'return 1']]).exec(...);
```

## client.sendCommand(commandName, args, [callback])

Used internally to send commands to Redis. For convenience, nearly all commands that are published on the Redis Wiki have been added to the `client` object. However, any were missed, or if new commands are introduced before this library is updated, you can use `sendCommand()` to send arbitrary commands to Redis.

All commands are sent as multi-bulk commands. `args` can either be an Array of arguments, or omitted.

## client.connected

Boolean tracking the state of the connection to the Redis server.

## client.commandQueue.length

The number of commands that have been sent to the Redis server but not yet replied to. You can use this to enforce some kind of maximum queue depth for commands while connected.

Don't mess with `client.commandQueue` unless you really know what you are doing.

## client.offlineQueue.length

The number of commands that have been queued up for a future connection. You can use this to enforce some kind of maximum queue depth for pre-connection commands.

## client.retryDelay

Current delay in milliseconds before a connection retry will be attempted. This starts at `250`.

## client.retryBackoff

Multiplier for future retry timeouts. This should be larger than 1 to add more time between retries. Defaults to 1.7. The default initial connection retry is 250, so the second retry will be 425, followed by 723.5, etc.

### Commands with Optional and Keyword arguments

This applies to anything that uses an optional `[WITHSCORES]` or `[LIMIT offset count]` in the [redis.io/commands](http://redis.io/commands) documentation.

Example:
```js
var args = [ 'myzset', 1, 'one', 2, 'two', 3, 'three', 99, 'ninety-nine' ];
client.zadd(args, function (err, response) {
    if (err) throw err;
    console.log('added '+response+' items.');

    // -Infinity and +Infinity also work
    var args1 = [ 'myzset', '+inf', '-inf' ];
    client.zrevrangebyscore(args1, function (err, response) {
        if (err) throw err;
        console.log('example1', response);
        // write your code here
    });

    var max = 3, min = 1, offset = 1, count = 2;
    var args2 = [ 'myzset', max, min, 'WITHSCORES', 'LIMIT', offset, count ];
    client.zrevrangebyscore(args2, function (err, response) {
        if (err) throw err;
        console.log('example2', response);
        // write your code here
    });
});
```

## TODO

* Complete the migration of all tests to Mocha

## LICENSE

MIT http://brandon.mit-license.org
