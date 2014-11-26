/* eslint-disable */

var redis  = require("redis-promised"),
    client = redis.createClient();

// This command is magical.  Client stashes the password and will issue on every connect.
client.auth("somepass");
