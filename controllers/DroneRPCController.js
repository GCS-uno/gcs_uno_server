"use strict";

const
    Logger = require('../utils/logger')
    ,RK = require('./../defs/redis_keys')
    ,NodeRedisRpc = require('../utils/node-redis-rpc')
    ,_ = require('lodash');

//
// RPC контроллер
class DroneRPCController {
    constructor(drone) {

        this.methods = {};
        this.RPC = new NodeRedisRpc({ emitter: drone.redis.Pub, receiver: drone.redis.Sub });

        this.RPC.on(RK.DRONE_RPC(drone.id), (data, channel, response_callback) => {
            if( _.has(this.methods, data.method) ) this.methods[data.method](data.data, response_callback);
            else {
                Logger.error('Wrong droneRPC method: ' + data.method);
                response_callback('wrong method');
            }
        });
    }

    setMethod(method, handler){
        if( _.has(this.methods, method) ) Logger.error('RPC method overwrite: ' + method);

        this.methods[method] = handler;
    }
}

module.exports = DroneRPCController;
