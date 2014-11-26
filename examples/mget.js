/* eslint-disable */

var client = require("redis-promised").createClient();

client.mget(["sessions started", "sessions started", "foo"], function (err, res) {
    console.dir(res);
});
