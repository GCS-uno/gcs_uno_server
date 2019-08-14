"use strict";

const {redisClient, RPC} = require('../utils/redis')
     ,RK = require('../defs/redis_keys')
     ,_ = require('lodash')
     ,Logger = require('../utils/logger')
     ,DroneModel = require('../db_models/Drone')
     ,DroneUDPProxyController = require('../controllers/DroneUDPProxy');


//
// Достаем список дронов из БД, проверяем должен ли быть включен UDP сервер для дрона
DroneModel.filter({type:"mavlink"}).run()
    .then(function(result) {
        _.forEach(result, drone => {

            try {
                redisClient.hget(RK.DRONE_INFO_KEY(drone.id), 'udp_ip_s', function(err, result){
                    if( err ) throw new Error('redis failed to get drone key');

                    if( parseInt(result) === 1 ){

                        Logger.info('Starting server for ' + drone.id);
                        DroneUDPProxyController.start(drone.id, drone.udp_port)
                            .then(function(){
                                Logger.info('UDP started on port ' + drone.udp_port);
                            })
                            .catch(Logger.error);
                    }
                });
            }
            catch (err) {
                Logger.error('Failed to start UDP on port ' + drone.udp_port );
                Logger.error(err);
            }

        });
    })
    .catch(function(err){
        Logger.error('get drones list error');
        Logger.error(err);
    });



//
//  Управление UDP серверами
//
RPC.on(RK.DRONE_UDP_PROXY_START(), function(data, channel, response_callback){
    console.log("Start request for " + data.port);
    DroneUDPProxyController.start(data.drone_id, data.port)
        .then( result => response_callback(null, result) )
        .catch( response_callback );

});

RPC.on(RK.DRONE_UDP_PROXY_STOP(), function(data, channel, response_callback){
    console.log("Stop request");
    DroneUDPProxyController.stop(data.drone_id)
        .then( result => response_callback(null, result) )
        .catch( response_callback );

});

RPC.on(RK.DRONE_UDP_PROXY_RESTART(), function(data, channel, response_callback){
    DroneUDPProxyController.restart(data.drone_id, data.port)
        .then( result => response_callback(null, result) )
        .catch( response_callback );

});




//
// Движения на выходе
process.on('SIGINT', exit);
function exit() {
    Logger.warn('STOPPING UDP SERVER');
    redisClient.bgsave(function(err, msg){
        console.log(msg);
        process.exit();
    });
}

