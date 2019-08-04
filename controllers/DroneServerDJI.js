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
     ,DataFlashLogModel = require('../db_models/DataFlashLog')
     ,DataFlashLog = require('../utils/dataflash_logs');

const io = require('socket.io-emitter')({ host: server_config.REDIS_HOST, port: server_config.REDIS_PORT });


class DroneServer {

    //
    // Конструктор дрона
    constructor(params){
        /* параметры из БД
            params.
                id
                mav_sys_id
                mav_cmp_id
                mav_gcs_sys_id
                mav_gcs_cmp_id
                joystick_enable
                dl_log_on_disarm
         */

        let start_time = helpers.now_ms();

        const _this = this;

        this.redis = {
             Sub: redisClient.duplicate()
            ,Pub: redisClient.duplicate()
            ,SubBuf: redisClientBuf.duplicate()
        };

        //
        /* Event emitter
            infoChanged (changed_fields) => {}     нужен обработчик для отправки изменений в браузер
            infoLoaded (all_fields) => {}
            isOnline (downtime) => {} время доунтайм в секундах
            isOffline (uptime) => {} время аптайм в секундах
            paramsChanged () => {}
            destroy () => {}
            armed () => {}
            disarmed () => {}
            mavlinkMessage
         */
        this.events = new EventEmitter();

        this.data_keys = {
             // Переменные и каналы redis и IO
             DJI_IO_FROM_DRONE: RK.DJI_IO_FROM_DRONE(params.id) // MAVLink с борта
            ,DJI_IO_TO_DRONE: RK.DJI_IO_TO_DRONE(params.id) // MAVLink на борт
            ,DRONE_UI_COMMANDS: RK.DRONE_UI_COMMANDS(params.id) // Канал с командами из браузера
            ,DRONE_INFO_CHANNEL: RK.DRONE_INFO_CHANNEL(params.id) // Канал с информацией
            ,DRONE_INFO_KEY: RK.DRONE_INFO_KEY(params.id) // Переменая с информацией о дроне
            ,DRONE_IO_ROOM: IK.DRONE_IO_ROOM(params.id) // Канал в io для исходящей телеметрии дрона
        };

        this.id = params.id;
        this.data = {
            // Тип автопилота
            autopilot: null // 3=Ardupilot, 12=PX4
            // Тип рамы
            ,type: null
            // список полетных режимов
            ,modes: null
            // по какому типу определять режим base или custom
            ,modes_type: null
            ,db_params: params // Параметры из БД
            // Счетчики сообщений
            ,message_counters: {
                total: 0
                ,decoded: 0
                ,missed: 0
                ,errors: 0
                ,create_errors: 0
            }
        };

        //this.RPC = new NodeRedisRpc({ emitter: this.redis.Pub, receiver: this.redis.Sub });
        //this.RPC2 = new RPCController(this);

        // Отправка сообщений в web приложение
        this.send2io = function(event, data){
            io.to(_this.data_keys.DRONE_IO_ROOM).emit(event + '_' + _this.id, data)
        };

        this.redis.Sub.subscribe(this.data_keys.DJI_IO_FROM_DRONE);
        // Как только приходит команда, проверяем этот ли канал, и отправляем на преобразование и исполнение
        this.redis.Sub.on('message', (channel, data) => {
            // Команда с предварительной обработкой из браузера
            if( this.data_keys.DJI_IO_FROM_DRONE === channel ){

                if( data ){
                    let telem = JSON.parse(data);

                    console.log("Dji drone data", telem);
                }
                else {
                    console.log("No data in " + channel);
                }


            }
        });

        Logger.info(`DroneServerDJI started (${helpers.now_ms()-start_time}ms) for ${this.data.db_params.name}`);

    }

    //
    // Обновление параметров из БД
    update(data){

        // Переписать параметры в памяти
        _.mapKeys(data, (v, k) => { this.data.db_params[k] = v; });

        // Сообщить всем, что параметры изменены
        this.events.emit('paramsChanged');


    }

    //
    // Вызывается перед уничтожением экземпляра на сервере
    destroy(){

        // Обнулить все периодические функции и подписки
        this.events.emit('destroy');

        Logger.info('DroneServer destroyed ' + this.id);

    }

}


module.exports = DroneServer;
