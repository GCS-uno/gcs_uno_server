"use strict";

const server_config = require('./../configs/server_config'),
      Logger = require('./logger'),
      redis = require('redis'),
      NRP = require('node-redis-pubsub'),
      NodeRedisRpc = require('./node-redis-rpc'),
      {promisify} = require('util');


// Redis client init
const redisClient = redis.createClient({
    host: server_config.REDIS_HOST,
    port: server_config.REDIS_PORT,
    string_numbers: true,
    retry_strategy: function(){
        console.log('Reconnecting to redis');
        return 1000; // try to reconnect after 1 sec
    }
});

const redisClientBuf = redis.createClient({
    host: server_config.REDIS_HOST,
    port: server_config.REDIS_PORT,
    return_buffers: true,
    retry_strategy: function(){
        console.log('Reconnecting to redis');
        return 1000; // try to reconnect after 1 sec
    }
});

redisClient.setMaxListeners(100);

redisClient.on('ready',function() { console.log("Redis is ready"); });
redisClient.on('error',function(e) { console.log("Error in Redis", e); });
redisClientBuf.on('ready',function() { console.log("Redis is ready"); });
redisClientBuf.on('error',function(e) { console.log("Error in Redis", e); });


const redisPub = redisClient.duplicate(),
      redisSub = redisClient.duplicate(),
      redisPubBuf = redisClientBuf.duplicate(),
      redisSubBuf = redisClientBuf.duplicate(),
      rGet = promisify(redisClient.get).bind(redisClient),
      rHGet = promisify(redisClient.hget).bind(redisClient),
      rHGetAll = promisify(redisClient.hgetall).bind(redisClient);

//redisPub.setMaxListeners(100);
//redisSub.setMaxListeners(100);

const RPC = new NodeRedisRpc({ emitter: redisPub, receiver: redisSub });

const PubSub = new NRP({ emitter: redisPub, receiver: redisSub }); // This is the NRP client


module.exports = {
    redisClient,
    redisClientBuf,
    redisPub,
    redisSub,
    redisPubBuf,
    redisSubBuf,
    //PubSub,
    RPC,
    rGet,
    rHGet,
    rHGetAll
};

