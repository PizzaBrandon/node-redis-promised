function setUnion(seta, setb) {
	var obj = {};

	seta.forEach(function parseSetA(val) {
		obj[val] = true;
	});
	setb.forEach(function parseSetB(val) {
		obj[val] = true;
	});
	return Object.keys(obj);
}

module.exports = setUnion(['get', 'set', 'setnx', 'setex', 'append', 'strlen', 'del', 'exists', 'setbit', 'getbit', 'setrange', 'getrange', 'substr',
		'incr', 'decr', 'mget', 'rpush', 'lpush', 'rpushx', 'lpushx', 'linsert', 'rpop', 'lpop', 'brpop', 'brpoplpush', 'blpop', 'llen', 'lindex',
		'lset', 'lrange', 'ltrim', 'lrem', 'rpoplpush', 'sadd', 'srem', 'smove', 'sismember', 'scard', 'spop', 'srandmember', 'sinter', 'sinterstore',
		'sunion', 'sunionstore', 'sdiff', 'sdiffstore', 'smembers', 'zadd', 'zincrby', 'zrem', 'zremrangebyscore', 'zremrangebyrank', 'zunionstore',
		'zinterstore', 'zrange', 'zrangebyscore', 'zrevrangebyscore', 'zcount', 'zrevrange', 'zcard', 'zscore', 'zrank', 'zrevrank', 'hset', 'hsetnx',
		'hget', 'hmset', 'hmget', 'hincrby', 'hdel', 'hlen', 'hkeys', 'hvals', 'hgetall', 'hexists', 'incrby', 'decrby', 'getset', 'mset', 'msetnx',
		'randomkey', 'select', 'move', 'rename', 'renamenx', 'expire', 'expireat', 'keys', 'dbsize', 'auth', 'ping', 'echo', 'save', 'bgsave',
		'bgrewriteaof', 'shutdown', 'lastsave', 'type', 'multi', 'exec', 'discard', 'sync', 'flushdb', 'flushall', 'sort', 'info', 'monitor', 'ttl',
		'persist', 'slaveof', 'debug', 'config', 'subscribe', 'unsubscribe', 'psubscribe', 'punsubscribe', 'publish', 'watch', 'unwatch', 'cluster',
		'restore', 'migrate', 'dump', 'object', 'client', 'eval', 'evalsha'],

	[
		'append',
		'auth',
		'bgrewriteaof',
		'bgsave',
		'bitcount',
		'bitop',
		'bitpos',
		'blpop',
		'brpop',
		'brpoplpush',
		'client kill',
		'client list',
		'client getname',
		'client pause',
		'client setname',
		'config get',
		'config rewrite',
		'config set',
		'config resetstat',
		'dbsize',
		'debug object',
		'debug segfault',
		'decr',
		'decrby',
		'del',
		'discard',
		'dump',
		'echo',
		'eval',
		'evalsha',
		'exec',
		'exists',
		'expire',
		'expireat',
		'flushall',
		'flushdb',
		'get',
		'getbit',
		'getrange',
		'getset',
		'hdel',
		'hexists',
		'hget',
		'hgetall',
		'hincrby',
		'hincrbyfloat',
		'hkeys',
		'hlen',
		'hmget',
		'hmset',
		'hset',
		'hsetnx',
		'hvals',
		'incr',
		'incrby',
		'incrbyfloat',
		'info',
		'keys',
		'lastsave',
		'lindex',
		'linsert',
		'llen',
		'lpop',
		'lpush',
		'lpushx',
		'lrange',
		'lrem',
		'lset',
		'ltrim',
		'mget',
		'migrate',
		'monitor',
		'move',
		'mset',
		'msetnx',
		'multi',
		'object',
		'persist',
		'pexpire',
		'pexpireat',
		'pfadd',
		'pfcount',
		'pfmerge',
		'ping',
		'psetex',
		'psubscribe',
		'pubsub',
		'pttl',
		'publish',
		'punsubscribe',
		'quit',
		'randomkey',
		'rename',
		'renamenx',
		'restore',
		'rpop',
		'rpoplpush',
		'rpush',
		'rpushx',
		'sadd',
		'save',
		'scard',
		'script exists',
		'script flush',
		'script kill',
		'script load',
		'sdiff',
		'sdiffstore',
		'select',
		'set',
		'setbit',
		'setex',
		'setnx',
		'setrange',
		'shutdown',
		'sinter',
		'sinterstore',
		'sismember',
		'slaveof',
		'slowlog',
		'smembers',
		'smove',
		'sort',
		'spop',
		'srandmember',
		'srem',
		'strlen',
		'subscribe',
		'sunion',
		'sunionstore',
		'sync',
		'time',
		'ttl',
		'type',
		'unsubscribe',
		'unwatch',
		'watch',
		'zadd',
		'zcard',
		'zcount',
		'zincrby',
		'zinterstore',
		'zlexcount',
		'zrange',
		'zrangebylex',
		'zrangebyscore',
		'zrank',
		'zrem',
		'zremrangebylex',
		'zremrangebyrank',
		'zremrangebyscore',
		'zrevrange',
		'zrevrangebyscore',
		'zrevrank',
		'zscore',
		'zunionstore',
		'scan',
		'sscan',
		'hscan',
		'zscan'
	]);
