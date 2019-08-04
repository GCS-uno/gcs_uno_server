"use strict";

const _ = require('lodash')
    ,Logger = require('../utils/logger')
    ,DroneModel = require('../db_models/Drone')
    ,DroneServerController = require('../controllers/DroneServerController');




// Достаем список дронов из БД и запускаем для каждого сервер
DroneModel.getList().run()
    .then(function(result) {
        _.forEach(result, function(drone){
            try {
                DroneServerController.start(drone);
            }
            catch (err) {
                Logger.error('Failed to start DroneServer for ' + drone.id );
                Logger.error(err);
            }

        });
    })
    .catch(function(err){
        Logger.error('get drones list error');
        Logger.error(err);
    });


// Смотрим изменения в БД с дронами и управляем серверами
DroneModel.look()
    .then(function(cursor){
        cursor.each(function(err, data){

            // Добавился новый дрон
            if( !data.old_val && data.new_val ){
                try {
                    DroneServerController.start(data.new_val);
                    Logger.info('DroneServer started for ' + data.new_val.id );
                }
                catch (err) {
                    Logger.error('Failed to start DroneServer for ' + data.new_val.id );
                    Logger.error(err);
                }
            }

            // Удалился дрон
            else if( data.old_val && !data.new_val ){
                try {
                    DroneServerController.destroy(data.old_val.id);
                    Logger.info('Drone destroyed ' + data.old_val.id );
                }
                catch (err) {
                    Logger.error('Failed to destroy DroneServer for ' + data.old_val.id );
                    Logger.error(err);
                }
            }

            // Изменение параметров
            else if( data.old_val && data.new_val ){
                try {
                    DroneServerController.update(data.new_val);
                    Logger.info('Drone data updated for ' + data.old_val.id );
                }
                catch (err) {
                    Logger.error('Failed to update DroneServer for ' + data.old_val.id );
                    Logger.error(err);
                }
            }

        });
    })
    .catch(Logger.error);




