"use strict";


const
     server_config = require('../configs/server_config')
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
    ,io_rpc = require('../utils/io_rpc')
    ,rpc_routes = require('../defs/rpc_routes')
    // DB Models
    ,DroneModel = require('../db_models/Drone')
    ,DataFlashLogModel = require('../db_models/DataFlashLog')
    ,DataFlashLog = require('../utils/dataflash_logs')
    ,IOSClientManager = require("../controllers/IOSClientManager")
; /////////


let connected_drones = {};

const connectDrone = function(drone_id, socket){
    let redis_ch_from_drone = RK.DJI_IO_FROM_DRONE(drone_id);
    let redis_ch_to_drone = RK.DJI_IO_TO_DRONE(drone_id);

    // Подписка на канал redis откуда приходят команды для дрона
    redisSub.subscribe(redis_ch_to_drone);
    // Как только приходит команда, проверяем этот ли канал, и отправляем на преобразование и исполнение
    redisSub.on('message', (channel, message) => {
        // Команда с предварительной обработкой из браузера
        if( redis_ch_to_drone === channel ){
            const message_data = JSON.parse(message);
            if( !message_data || !_.has(message_data, 'event') ) return;

            if( message_data.event === 'command' && _.has(message_data, 'data') && _.has(message_data.data, 'command')){
                // Выполняем команду
                socket.emit("commandWithAck", message_data.data.command, message_data.data, response => {
                    console.log("Drone data from command 23", response);
                });
            }
            else {
                socket.emit(message_data.event, message_data.data);
            }

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


try {

    const app = express();
    const server = new http.Server(app);
    const io_server = require('socket.io')(server);

    Logger.info('server start');

    // Socket.io_server server init
    io_server.adapter(io_redis_adapter({ pubClient: redisPub, subClient: redisSub }));

    // io RPC
    const RPC = new io_rpc();
    _.mapKeys(rpc_routes, (handler, method) => { RPC.setMethod(method, handler) });

    // static files init
    app.use(express.static(__dirname + './../pilot-ui'));

    // JSON parse init
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: false}));
    app.use(fileUpload());

    // HTTP API calls
    // Загрузка лога
    app.post('/api/log_upload', function (request, response) {

        const promise = new Promise((resolve, reject) => {

            // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file

            let uploaded_file = request.files.upload;

            // Придумать уникальное имя файла
            let file_name = helpers.now_ms() + '_' + nodeUuid.v4().substr(0, 10) + '.bin';

            // Скопировать файл
            uploaded_file.mv(__dirname + '/../logs/' + file_name, function(err) {
                if (err){
                    Logger.error(err);
                    reject('Failed to move log file');
                }
                else {

                    // Распарсить файл
                    const spawn = require("child_process").spawn;

                    const pyprocess = spawn('python',["./../utils/pymavlink/DFReader.py", './../logs/' + file_name] );

                    let parse_response = '';
                    pyprocess.stdout.on('error', function() {
                        Logger.error('Bin parse error');
                        reject('Bin parse error');
                    } );
                    pyprocess.stdout.on('data', function(data) {
                        parse_response = parse_response + data;
                    } );
                    pyprocess.stdout.on('close', function() {

                        if( !parse_response.includes('OK') ){
                            reject('Failed');
                            return;
                        }

                        DataFlashLog.grab_data(file_name)
                            .then( grab_result => {

                                try {

                                    let new_log_data = {
                                        bin_file: file_name
                                        ,gps_time: DataFlashLogModel.r().epochTime(grab_result.gps_time)
                                        ,l_time: grab_result.l_time
                                    };

                                    if( grab_result.lat !== null && grab_result.lon !== null ){
                                        new_log_data.location_point = DataFlashLogModel.r().point(grab_result.lon, grab_result.lat);
                                        new_log_data.location = grab_result.lat + '  ' + grab_result.lon;
                                    }

                                    // Завести запись в БД
                                    const new_log = new DataFlashLogModel(new_log_data);

                                    try {
                                        // Validate data
                                        new_log.validate();

                                        // Save new log
                                        new_log.save()
                                            .then( doc => {
                                                Logger.info('new log saved ' + doc.id);

                                                // Response with success
                                                resolve({ status: 'server' });
                                            })
                                            .catch( e => {
                                                Logger.error(e);
                                                reject('Saving error');
                                            });
                                    }
                                    catch(e){
                                        // Response with error
                                        if( 'ValidationError' === e.name ){
                                            Logger.warn('Log create validation failed');
                                            Logger.warn(e);
                                            reject('Log create validation failed');
                                        }
                                        else {
                                            Logger.error('Database error drone create');
                                            Logger.error(e);
                                            reject('Database error');
                                        }
                                    }


                                }
                                catch(e){
                                    _this.report_process({status: 'failed', id: _this.current_dl_log_num, msg: 'Failed to save to DB (1)'});
                                    _this.cancel_process();

                                    // Response with error
                                    if( 'ValidationError' === e.name ){
                                        Logger.warn('Log create validation failed');
                                        Logger.warn(e);
                                    }
                                    else {
                                        Logger.error('Database error drone create');
                                        Logger.error(e);
                                    }
                                }
                            })
                            .catch( err => {
                                Logger.error(err);
                                reject('Init parse error');
                            });


                    });

                }

            });

        });


        // Возвращаем результат
        promise
            .then( result => response.json(result) )
            .catch( error => {
                Logger.error(error);
                response.json({ status: 'failed' });
            });

    });

    //
    // Запуск web-сервера
    server.listen(server_config.IO_SERVER_PORT, server_config.IO_SERVER_HOST, () => {
        Logger.info('Listening on ' + server_config.IO_SERVER_HOST + ':' + server_config.IO_SERVER_PORT);
    });



    /*
               IO Server
     */

    io_server.on('connection', function(client_socket) {

        let client_type = client_socket.handshake.headers['x-io-client']; // webapp или iosapp

        // iOS app
        if( 'iosapp' === client_type ){
            console.log("iOS app connected");

            IOSClientManager.connect(client_socket)
                .then( function(authKey){

                    console.log('iOS app connected with key', authKey);

                    // Приложение подклчено
                    let requestDroneDataTimeout = null;
                    let droneName = null;
                    let droneSN = null;
                    let droneID = null;
                    let drone_connected = false;


                    const requestDroneDataAfter = function(timeout_sec){
                        console.log("Req drone data timeout");
                        requestDroneDataTimeout = setTimeout( () => client_socket.emit('getDroneData'), timeout_sec*1000);
                    };



                    client_socket.on('droneData', data => { // Drone data [ 1, 'Drone name', 'serial_number_2342352523' ]
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
                                if( droneName.length > 4 && droneSN.length > 5 ){

                                    DroneModel.filter({dji_model: droneName, dji_fc_serial: droneSN}).run()
                                        .then( list => {
                                            // Если такой дрон есть, то создаем канал передачи данных
                                            if( list.length ){
                                                Logger.info("Drones found " + list.length + " 1st id: " + list[0].id);

                                                connectDrone(list[0].id, client_socket);
                                                droneID = list[0].id;
                                                drone_connected = true;

                                            }
                                            // А если нет, то ищем дрон type=dji, model=new, sn=new
                                            else {
                                                Logger.info(`No drones found with model ${droneName}, sn ${droneSN}`);
                                                Logger.info("Looking for new drones...");

                                                DroneModel.filter({dji_model: "new", dji_fc_serial: "new", type: "dji"}).run()
                                                    .then( list => {
                                                        if( list.length ){
                                                            Logger.info(`New DJI drone found, id ${list[0].id}`);

                                                            let new_drone = list[0];
                                                            new_drone.dji_model = droneName;
                                                            new_drone.dji_fc_serial = droneSN;

                                                            try {
                                                                // Save new drone
                                                                new_drone.save()
                                                                    .then(function(drone) {
                                                                        Logger.info('New drone updated ' + drone.id);

                                                                        connectDrone(drone.id, client_socket);
                                                                        droneID = drone.id;
                                                                        drone_connected = true;

                                                                    })
                                                                    .catch( e => {
                                                                        Logger.error(e);
                                                                    });

                                                            }
                                                            catch(e){
                                                                // Response with error
                                                                if( 'ValidationError' === e.name ){
                                                                    Logger.warn('Drone create form validation failed');
                                                                    Logger.warn(e);
                                                                }
                                                                else {
                                                                    Logger.error('Database error drone create');
                                                                    Logger.error(e);
                                                                }
                                                            }
                                                        }
                                                        else {
                                                            Logger.info("No new drones found");
                                                            client_socket.disconnect(true);
                                                        }

                                                    });


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
                    client_socket.emit('status', 'ok'); // этот статус отправляется в приложение !!! ok - строчные

                    // Пример отправки команды с подтверждением
                    //client_socket.emit("commandWithAck", "getDroneData", {}, response => {
                    //    console.log("Drone data from command", response);
                    //});



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
                    client_socket.emit('status', err);
                    setTimeout( () => {client_socket.disconnect();}, 500);
                });

        }

        // Соединение браузерной GCS
        else if( "webapp" === client_type ){




            Logger.info('Web GCS connected ' + client_socket.handshake.address);

            //
            // в случае потери связи
            client_socket.on('disconnect', function(){
                Logger.info('GCS disconnected');
            });

            //
            // Реализация RPC через socket.io
            // req => req.method - применяемый метод, req.data - объект с данными
            // response_callback => функция обратного вызова  resp({response_data})
            //              response({status:'failed', message:'Failed'})
            //              response({status:'success', data: {}})
            client_socket.on('__apirpc', function(req, response_callback){

                if( req && _.has(req, 'method') && _.has(req, 'data') && _.isString(req.method) ){
                    RPC.execute(req.method, req.data)
                        .then( resp_data => {
                            response_callback({status: 'success', data: resp_data});
                        })
                        .catch( err_msg => {
                            response_callback({status: 'failed', message: err_msg});
                        });
                }
                else {
                    response_callback({status: 'failed', message: 'Wrong data from client'});
                }
            });


            // Отправляем статус соединения
            client_socket.emit('status', 'connected');


            // Запрос на подключение каждого дрона к своему каналу
            client_socket.on('drone_gcs_connect', function(drone_id, conn_response){

                DroneModel.get(drone_id).run()
                    .then(function(drone){

                        // Подключаем экземпляр браузера к каналу телеметрии, куда отправляет данные DroneServer
                        client_socket.join(IK.DRONE_IO_ROOM(drone_id)); // telemetry room

                        // Удаляем старые обработчики команд (которые могли остаться от предыдущих вызовов)
                        client_socket.removeAllListeners('drone_command_' + drone_id);

                        // Создаем новый обработчик команд
                        client_socket.on('drone_command_' + drone_id, function(command_data){
                            // Команды из браузера отправляются в канал редис
                            redisPub.publish(RK.DRONE_UI_COMMANDS(drone_id), JSON.stringify(command_data));
                        });

                        // Запрос данных дрона
                        Promise.all([
                            // инфо из редиса
                            rHGetAll(RK.DRONE_INFO_KEY(drone_id))
                            // параметры из БД
                            ,new Promise(function (resolve, reject) { return rpc_routes.droneGet({id: drone_id}, resolve, reject) })
                        ])
                            .then( results => {
                                let info = results[0] || {};

                                if( !_.has(info, 'online') ) info.online = 0;
                                if( !_.has(info, 'last_message_time') ) info.last_message_time = 0;

                                conn_response({
                                    status: 'success'
                                    ,info: info
                                    ,params: results[1]
                                });

                                Logger.info('GSC joined ' + drone_id);
                            })
                            .catch( (err) => {
                                conn_response({status: 'fail'});
                                Logger.error(err);
                            });

                    })
                    .catch( function(err){
                        conn_response({status: 'fail'});
                        Logger.error('Get DroneModel error');
                        Logger.error(err);
                    });
            });

            //
            // Трансляция изменений БД
            // Смотрим изменения в БД с дронами и управляем серверами
            DataFlashLogModel.look()
                .then(function(cursor){
                    cursor.each(function(err, data){

                        // Добавился новый лог
                        if( !data.old_val && data.new_val ){

                            let new_log = {
                                id: data.new_val.id
                                ,date: data.new_val.createdAt
                                ,d_name: ''
                                ,gps_ts: data.new_val.gps_time || ''
                                ,location: data.new_val.location || ''
                                ,l_time: helpers.readable_seconds(data.new_val.l_time || 0)
                            };

                            const send_data = function(){
                                client_socket.emit('logs_look', { e: 'new' ,data: new_log });
                            };

                            if( data.new_val.drone_id && data.new_val.drone_id.length > 5 ){
                                DroneModel.get(data.new_val.drone_id).run()
                                    .then( drone => {
                                        new_log.d_name = drone.name;
                                        send_data();
                                    })
                                    .catch( err => {
                                        Logger.error(err);
                                        send_data();
                                    })
                            }
                            else send_data();


                        }

                        // Удалился лог
                        else if( data.old_val && !data.new_val ){
                            client_socket.emit('logs_look', {
                                e: 'del'
                                ,data: {
                                    id: data.old_val.id
                                }
                            });
                        }


                        // Изменение данных
                        else if( data.old_val && data.new_val ){
                            client_socket.emit('logs_look', {
                                e: 'upd'
                                ,data: {
                                    id: data.new_val.id
                                    ,location: data.new_val.location
                                }
                            });
                        }



                    });
                })
                .catch(Logger.error);

        }

        // Неизвестное соединение
        else {
            client_socket.disconnect();
        }


    });

}
catch (e){
    exit(e);
}


//
// Движения на выходе
process.on('SIGINT', exit);
function exit(e) {

    Logger.warn('STOPPING PILOT SERVER', (e || ''));

    if( !e ) {
        redisClient.bgsave(function(){
            process.exit();
        });
    }
    else {
        process.exit();
    }
}
