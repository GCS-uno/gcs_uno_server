"use strict";

const server_config = require('../configs/server_config')
    ,_ = require('lodash')
    ,http = require('http')
    ,nodeUuid = require('node-uuid')
    ,express = require('express')
    ,fileUpload = require('express-fileupload')
    ,{redisClient, redisPub, redisSub, rHGetAll} = require('../utils/redis')
    ,RK = require('../defs/redis_keys')
    ,IK = require('../defs/io_keys')
    ,bodyParser = require('body-parser')
    ,Logger = require('../utils/logger')
    ,helpers = require('../utils/helpers')
    ,io_redis_adapter = require('socket.io-redis')
    ,io = require('socket.io')
    ,io_rpc = require('../utils/io_rpc')
    ,IOSClientManager = require("../controllers/IOSClientManager")
    // DB Models
    ,DroneModel = require('../db_models/Drone')
; /////////


const server = new http.Server();
const io_server = io(server);

// Socket.io_server server init
io_server.adapter(io_redis_adapter({ pubClient: redisPub, subClient: redisSub }));

// Запуск web-сервера
server.listen(server_config.DJI_SERVER_PORT, server_config.DJI_SERVER_HOST, () => {
    console.log(`Listening on ${server_config.DJI_SERVER_HOST}:${server_config.DJI_SERVER_PORT}`);
});


let connected_drones = {};

const connectDrone = function(drone_id, socket){
    let redis_ch_from_drone = RK.DJI_IO_FROM_DRONE(drone_id);
    let redis_ch_to_drone = RK.DJI_IO_TO_DRONE(drone_id);

    // Подписка на канал redis откуда приходят команды для дрона
    redisSub.subscribe(redis_ch_to_drone);
    // Как только приходит команда, проверяем этот ли канал, и отправляем на преобразование и исполнение
    redisSub.on('message', (channel, data) => {
        // Команда с предварительной обработкой из браузера
        if( redis_ch_to_drone === channel ){
            const com_data = JSON.parse(data);
            if( !com_data || !_.has(com_data, 'command') ) return;
            // Выполняем команду
            socket.emit("commandWithAck", com_data.command, com_data, response => {
                console.log("Drone data from command 23", response);
            });

        }
    });

    socket.on('commonTelemetry', data => {
        redisPub.publish(redis_ch_from_drone, JSON.stringify(['ct',data]));
    });

    socket.on('attitudeTelemetry', data => {
        redisPub.publish(redis_ch_from_drone, JSON.stringify(['at',data]));
    });

    connected_drones[drone_id] = socket;

    socket.emit('status', 'drone_ok');

};


// IO server
io_server.on('connection', function (socket) {

    let client_type = socket.handshake.headers['x-io-client']; // webapp или iosapp

    if( 'iosapp' === client_type ){
        console.log("iOS app connected");

        IOSClientManager.connect(socket)
            .then( authKey => {

                console.log('iOS app connected with key', authKey);

                // Приложение подклчено
                let requestDroneDataTimeout = null;
                let droneName = null;
                let droneSN = null;
                let droneID = null;
                let drone_connected = false;


                const requestDroneDataAfter = function(timeout_sec){
                    console.log("Req drone data timeout");
                    requestDroneDataTimeout = setTimeout( () => socket.emit('getDroneData'), timeout_sec*1000);
                };



                socket.on('droneData', data => { // Drone data [ 1, 'Drone name', 'serial_number_2342352523' ]
                    console.log("Drone data", data);

                    clearTimeout(requestDroneDataTimeout);

                    // Drone connected
                    if( parseInt(data[0]) ){

                        // Если это новые данные к еще не подключенному дрону
                        if( !drone_connected && !droneID ){

                            droneName = data[1]+"";
                            droneSN = data[2]+"";

                            // Найти дрон в БД
                            // Если данные не пустые
                            if( droneName.length > 2 && droneSN.length > 2 ){
                                // Если такой дрон есть, то создаем канал передачи данных
                                DroneModel.filter({dji_model: droneName, dji_fc_serial: droneSN}).run()
                                    .then( list => {
                                        if( list.length ){
                                            Logger.info("Drones found " + list.length + " 1st id: " + list[0].id);

                                            connectDrone(list[0].id, socket);

                                        }
                                        else {
                                            Logger.info("No drones found");

                                            // Если нет, то сначала создаем новый дрон в БД
                                            let new_drone_data = {
                                                name: `New ${droneName} SN-${droneSN}`
                                                ,type: "dji"
                                                ,dji_model: droneName
                                                ,dji_fc_serial: droneSN
                                            };

                                            const new_drone = new DroneModel(new_drone_data);

                                            try {
                                                // Validate data
                                                new_drone.validate();

                                                // Save new drone
                                                new_drone.save()
                                                    .then(function(drone) {
                                                        Logger.info('new drone saved ' + drone.id);

                                                        connectDrone(drone.id, socket);

                                                    })
                                                    .catch( e => {
                                                        Logger.error(e);
                                                        reject('Saving error');
                                                    });

                                            }
                                            catch(e){
                                                // Response with error
                                                if( 'ValidationError' === e.name ){
                                                    Logger.warn('Drone create form validation failed');
                                                    Logger.warn(e);
                                                    reject('Form validation failed');
                                                }
                                                else {
                                                    Logger.error('Database error drone create');
                                                    Logger.error(e);
                                                    reject('Database error');
                                                }
                                            }

                                        }
                                    })
                                    .catch( err => {
                                        Logger.error(err);
                                    });
                            }
                            // Если данные пустые, то запросим данные еще раз
                            else {
                                requestDroneDataAfter(5);
                            }
                        }

                        // Если это дублированные данные и дрон уже подключен
                        else if( drone_connected ){
                            // Данные совпадают
                            if( droneName === data[0] && droneSN === data[1] ){
                                // ничего не делаем
                            }
                            // Данные не совпадают
                            else {
                                if( droneID && _.has(connected_drones, droneID) && connected_drones[droneID] ){
                                    connected_drones[droneID].disconnect(true);
                                    drone_connected = false;
                                    droneName = null;
                                    droneSN = null;
                                    setTimeout( () => {
                                        connected_drones[droneID] = null;
                                        _.unset(connected_drones, droneID);
                                        droneID = null;
                                    }, 1000);
                                }
                            }
                        }

                    }

                    // Drone disconnected
                    else {
                        requestDroneDataAfter(5);
                    }


                });


                // Пока этот статус не получит мобильное приложение, оно не будет себя считать подключенным
                socket.emit('status', 'ok'); // этот статус отправляется в приложение !!! ok - строчные

                //socket.emit('getDroneData');

                // Drone data [ 1, 'Phantom 4', '07JDD3S001023G' ]


                socket.emit("commandWithAck", "getDroneData", {}, response => {
                    console.log("Drone data from command", response);
                });



                /*
                    Теперь нужно распознать дрон по его серийному номеру

                    // Отправляем запрос на название и серийный номер

                    // Если данные не пришли, то повторно отправляем запрос каждые 5 секунд



                    // Контроллер дрона начинает принимать и передавать данные

                */


                //socket.join('dji_chan_to_' + authKey);

                //const drone = new NodeDJI(socket);

                //drone.on('appState', data => socket.to('dji_chan_from_' + authKey).emit('appState', data));

                //drone.on('commonTelemetry', data => socket.to('dji_chan_from_' + authKey).emit('commonTelemetry', data));

                //drone.on('attitudeTelemetry', data => socket.to('dji_chan_from_' + authKey).emit('attitudeTelemetry', data));

                //drone.on('droneData', data => socket.to('dji_chan_from_' + authKey).emit('droneData', data));

                //ios_clients.push(drone);


            })
            .catch( err => {
                console.log('iOS app connection err', err);
                socket.emit('status', err);
                setTimeout( () => {socket.disconnect();}, 500);
            });

    }
    else {
        socket.disconnect();
    }
});
