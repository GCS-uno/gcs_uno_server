"use strict";

/*

        ui-server.js
        API и socket.io сервер для взаимодействия с приложением в браузере

 */

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
    ,io_rpc = require('../utils/io_rpc')
    ,rpc_routes = require('../defs/rpc_routes')
    // DB Models
    ,DroneModel = require('../db_models/Drone')
    ,DataFlashLogModel = require('../db_models/DataFlashLog')
    ,DataFlashLog = require('../utils/dataflash_logs')
; /////////

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
            //console.log(request.files);

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
                        console.log('ERROR');
                        reject('Bin parse error');
                    } );
                    pyprocess.stdout.on('data', function(data) {
                        parse_response = parse_response + data;
                    } );
                    pyprocess.stdout.on('close', function() {
                        console.log(parse_response);

                        if( !parse_response.includes('OK') ){
                            reject('Failed');
                            return;
                        }

                        DataFlashLog.grab_data(file_name)
                            .then( grab_result => {

                                console.log("Grab log file data", grab_result);

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
    server.listen(server_config.UI_SERVER_PORT, server_config.UI_SERVER_HOST, () => {
        Logger.info('Listening on ' + server_config.UI_SERVER_HOST + ':' + server_config.UI_SERVER_PORT);
    });


    /*
               IO Server
     */

    // Соединение браузерной GCS
    io_server.on('connection', function(io_client) {

        Logger.info('GCS connected ' + io_client.handshake.address);

        //
        // в случае потери связи
        io_client.on('disconnect', function(){
            Logger.info('GCS disconnected');
        });

        //
        // Реализация RPC через socket.io
        // req => req.method - применяемый метод, req.data - объект с данными
        // response_callback => функция обратного вызова  resp({response_data})
        //              response({status:'failed', message:'Failed'})
        //              response({status:'success', data: {}})
        io_client.on('__apirpc', function(req, response_callback){

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
        io_client.emit('status', 'connected');


        // Запрос на подключение каждого дрона к своему каналу
        io_client.on('drone_gcs_connect', function(drone_id, conn_response){
            DroneModel.get(drone_id).run()
                .then(function(drone){

                    // Подключаем экземпляр браузера к каналу телеметрии, куда отправляет данные DroneServer
                    io_client.join(IK.DRONE_IO_ROOM(drone_id)); // telemetry room

                    // Удаляем старые обработчики команд (которые могли остаться от предыдущих вызовов)
                    io_client.removeAllListeners('drone_command_' + drone_id);

                    // Создаем новый обработчик команд
                    io_client.on('drone_command_' + drone_id, function(command_data){
                        // Команды из браузера отправляются в канал редис
                        //console.log(command_data);
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
                            io_client.emit('logs_look', { e: 'new' ,data: new_log });
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
                        io_client.emit('logs_look', {
                            e: 'del'
                            ,data: {
                                id: data.old_val.id
                            }
                        });
                    }


                    // Изменение данных
                    else if( data.old_val && data.new_val ){
                        //console.log('LOG UPD', data.new_val);
                        io_client.emit('logs_look', {
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
