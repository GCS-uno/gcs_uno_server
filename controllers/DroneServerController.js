"use strict";

const common_config = require('../configs/common_config')
    ,server_config = require('../configs/server_config')
    ,MAVLink = require('./../utils/mavlink2/mavlink2')
    ,EventEmitter = require('events')
    ,{redisClient, redisClientBuf, redisPubBuf, rHGetAll} = require('../utils/redis')
    ,NodeRedisRpc = require('../utils/node-redis-rpc')
    ,Logger = require('../utils/logger')
    ,RK = require('./../defs/redis_keys')
    ,IK = require('./../defs/io_keys')
    ,_ = require('lodash')
    ,fs = require('fs')
    ,nodeUuid = require('node-uuid')
    ,helpers = require('./../utils/helpers')
    ,FlightPlanModel = require('../db_models/FlightPlan')
    ,{FLIGHT_MODES, AUTOPILOTS, FRAME_TYPES, MAV_STATE} = require('../defs/mavlink')
    ,{telem1_fields, telem10_fields} = require('./../defs/io_telemetry_fields')
    ,turf_helpers = require('@turf/helpers')
    ,turf_dist = require('@turf/distance').default
    ,DroneServersList = {}
    ,DataFlashLogModel = require('../db_models/DataFlashLog')
    ,DataFlashLog = require('../utils/dataflash_logs')
    ,DroneServer = require("./DroneServer")
    ,DroneServerDJI = require("./DroneServerDJI");



const DroneServerController = function(){
    return {
        start: function(drone){ // Instance of DroneModel или {} с параметрами
            try {
                if( drone.type && drone.type === "dji" ) DroneServersList[drone.id] = new DroneServerDJI(drone);
                else DroneServersList[drone.id] = new DroneServer(drone);
            }
            catch(e){
                Logger.error('Error starting DroneServer instance of type ' + drone.type);
                Logger.error(e);
            }
        }

        ,update: function(drone_data){
            try {
                if( _.has(DroneServersList, drone_data.id) && DroneServersList[drone_data.id] ) DroneServersList[drone_data.id].update(drone_data);
            }
            catch(e){
                Logger.error('Error destroying DroneServer instance');
                Logger.error(e);
            }
        }

        ,destroy: function(drone_id){
            try {
                if( _.has(DroneServersList, drone_id) ){
                    DroneServersList[drone_id].destroy();
                    setTimeout(function(){DroneServersList[drone_id] = null;},5000);
                }
            }
            catch(e){
                Logger.error('Error destroying DroneServer instance');
                Logger.error(e);
            }
        }
    };
}();


module.exports = DroneServerController;
