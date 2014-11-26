/* eslint-disable */

var redis = require("redis-promised"),
    client = redis.createClient();

client.eval("return 100.5", 0, function (err, res) {
    console.dir(err);
    console.dir(res);
});

client.eval([ "return 100.5", 0 ], function (err, res) {
    console.dir(err);
    console.dir(res);
});
