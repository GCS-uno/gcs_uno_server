"use strict";
/*

    gcs-tcp-server.js
    Создает канал между UDP сервером с подключенным дроном и TCP портом для подключения
    к нему настольной GCS
    Канал ограничен 1 пользователем

 */

const {RPC, rHGet} = require('../utils/redis')
      ,RK = require('../defs/redis_keys')
      ,_ = require('lodash')
      ,Logger = require('../utils/logger')
      ,DroneModel = require('../db_models/Drone')
      ,GCSTCPProxyController = require('../controllers/GCSTCPProxy');



// Достаем список дронов из БД и создаем для каждого TCP сервер
DroneModel.filter({type:"mavlink"}).run()
    .then(function(result) {
        _.forEach(result, function(drone){

            try {
                rHGet(RK.DRONE_INFO_KEY(drone.id), 'tcp_op_s')
                    .then( result => {
                        if( parseInt(result) === 1 ){
                            Logger.info(`Starting TCP server for ${drone.name}, id ${drone.id}`);
                            GCSTCPProxyController
                                .start(drone.id, drone.gcs_tcp_port)
                                .then( res => {} ) // Сам сервер выводит в консоль о своем старте
                                .catch(Logger.error);
                        }
                        else {
                            console.log(`TCP off for ${drone.name}`)
                        }
                    })
                    .catch( err => {
                        throw new Error(`redis failed to get drone key for ${drone.id}`);
                    } );
            }
            catch (err) {
                Logger.error('Failed to start TCP on port ' + drone.gcs_tcp_port );
                Logger.error(err);
            }

        });
    })
    .catch(function(err){
        Logger.error('get drones list error');
        Logger.error(err);
    });


//
//  Управление TCP серверами
//
RPC.on(RK.DRONE_GCS_TCP_PROXY_START(), function(data, channel, response_callback){
    GCSTCPProxyController.start(data.drone_id, data.port)
        .then( data => response_callback(null, data) )
        .catch( response_callback );

});

RPC.on(RK.DRONE_GCS_TCP_PROXY_STOP(), function(data, channel, response_callback){
    GCSTCPProxyController.stop(data.drone_id)
        .then( data => response_callback(null, data) )
        .catch( response_callback );

});

RPC.on(RK.DRONE_GCS_TCP_PROXY_RESTART(), function(data, channel, response_callback){

    GCSTCPProxyController.restart(data.drone_id, data.port)
        .then( data => response_callback(null, data) )
        .catch( response_callback );

});


