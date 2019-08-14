const {redisClient, redisPub, redisSub, redisPubBuf, redisSubBuf} = require('../utils/redis')
      ,RK = require('../defs/redis_keys')
      ,dgram = require('dgram')
      ,Logger = require('../utils/logger')
      ,_ = require('lodash')
      ,common_config = require('../configs/common_config')
      ,proxy_by_port = {}
      ,proxy_by_id = {}
    ,helpers = require('../utils/helpers')
                                            ; /////


//
// Класс создания прокси сервера
class DroneUDPProxy {

    // Конструктор
    constructor(drone_id, port_id){

        this.port_id = port_id;
        this.drone_id = drone_id;
        this.udp_server = null;
        this.drone_client_ip = null;
        this.out_buffer = [];


        const DRONE_INFO_CHANNEL = RK.DRONE_INFO_CHANNEL(drone_id)
             ,DRONE_INFO_KEY = RK.DRONE_INFO_KEY(drone_id);

        //
        // Сохранение в дроне статуса UDP сервера
        this.save_udp_drone_status = function(status, message){
            redisClient.hmset(DRONE_INFO_KEY, 'udp_ip_s',status, 'udp_ip_c',message, function(err){
                if( err ){
                    Logger.error('Error set redis keys');
                    return;
                }

                redisPub.publish(DRONE_INFO_CHANNEL, JSON.stringify({udp_ip_s: status, udp_ip_c: message}));
            });
        };

    }

    // Запуск сервера для дрона
    start(){

        const MAVLINK_FROM_DRONE = RK.MAVLINK_FROM_DRONE(this.drone_id)
             ,MAVLINK_TO_DRONE = RK.MAVLINK_TO_DRONE(this.drone_id)
             ,_this = this;

        // Функция для сохранения сообщения в буффер для отправки, когда придет входящее
        const send_to_board = function(message){
            _this.out_buffer.push(message);
            // Если в буфере накопились сообщения, то удаляем более старые
            if( _this.out_buffer.length > 20 ) _this.out_buffer.shift();
        };

        return new Promise(function (resolve, reject) {
            try {

                // Слушаем входящий канал для отправки на дрон
                redisSubBuf.subscribe(MAVLINK_TO_DRONE);
                redisSubBuf.on('message', function(channel, message){

                    if( channel.toString() === MAVLINK_TO_DRONE && message.length < 500) send_to_board(message);

                });

                //
                // Инициализация UDP сервера
                _this.udp_server = dgram.createSocket('udp4');

                // UDP сервер запустился
                _this.udp_server.on('listening', () => {
                    Logger.info('UDP server running on port ' + _this.port_id);

                    _this.save_udp_drone_status(1, `Running on port ${_this.port_id}. No data in`);

                    resolve('started');
                });

                // Сервер не запустился
                _this.udp_server.on('error', err => {
                    Logger.error('UDP server error', err);

                    _this.save_udp_drone_status(0, 'failed with error');
                    _this.destroy();
                    reject('failed to start');
                });

                // UDP сервер остановился
                _this.udp_server.on('close', () => {
                    _this.save_udp_drone_status(0, 'stopped');
                    _this.destroy();
                });

                // Когда приходит mavlink сообщение от автопилота по UDP
                _this.udp_server.on('message', (message, remote) => {

                    // Первое сообщение делает привязку экземпляра к IP
                    if( !_this.drone_client_ip ){
                        _this.drone_client_ip = remote.address;
                        _this.save_udp_drone_status(1, 'drone IP ' + remote.address);
                    }
                    // Если сообщение пришло с не привязанного IP, то игнорируем его
                    else if( _this.drone_client_ip !== remote.address ) {
                        Logger.error(`CLIENT IP ERR, port ${_this.port_id}, locked to ${_this.drone_client_ip}, client ip ${remote.address},  `);
                        return;
                    }


                    // Исходящие сообщения для UDP
                    let msg_to_board = _this.out_buffer.shift();
                    if( msg_to_board ){
                        _this.udp_server.send(msg_to_board, 0, msg_to_board.length, remote.port, remote.address, function(err){
                            if( err ) Logger.error('UDP send error ' + err);
                        });
                    }


                    //
                    // Отправляем сообщение в канал редис
                    redisPubBuf.publish(MAVLINK_FROM_DRONE, message);
                    redisPubBuf.publish(RK.MAVLINK_FROM_DRONE_MONITOR(), message); // общий канал мониторинга

                });

                // Запускаем UDP сервер
                _this.udp_server.bind(_this.port_id);

            }
            catch (e){
                reject(`Failed to start UDP server on port ${_this.port_id}`);
            }
        });
    }

    // Остановка UDP сервера
    stop(){

        const _this = this;

        return new Promise(function(resolve, reject){
            try {
                _this.udp_server.close(() => {
                    Logger.info('UDP Proxy stopped at port ' + _this.port_id + ', drone ' + _this.drone_id);
                    _this.destroy();
                    resolve('stopped');
                });
            }
            catch(e){
                Logger.error('Failed to stop UDP proxy at port ' + _this.port_id + ', drone ' + _this.drone_id );
                Logger.error(e);
                reject('Failed to stop UDP [157]');
            }
        });

    }

    // Уничтожение ссылок на себя в глобальных переменных
    destroy(){
        _.unset(proxy_by_port, this.port_id);
        _.unset(proxy_by_id, this.drone_id);
    }

}

//
// Контроллер прокси серверов
const DroneUDPProxyController = function(){

    return {

        //
        // Запуск UDP Proxy сервера для дрона
        // Автоматически останавливает уже запущенный сервер
        start: function(drone_id, port_id){

            return new Promise(function(resolve, reject){
                try {

                    if( !drone_id ) return reject('No drone id');

                    if( port_id < common_config.DRONE_UDP_PORT_MIN || port_id > common_config.DRONE_UDP_PORT_MAX ) return reject('Invalid UDP port ' + port_id);

                    // Если сервер уже запущен, то возвращаем resolve
                    if( _.has(proxy_by_id, drone_id) ) return resolve('running');

                    // Если запрашиваемый порт не занят, запускаем на нем сервер
                    if( !_.has(proxy_by_port, port_id) ){

                        // Создаем новый прокси на порт UDP
                        let new_proxy = new DroneUDPProxy(drone_id, port_id);
                        new_proxy.start()
                            .then( res => {
                                proxy_by_id[drone_id] = new_proxy;
                                // Если получилось создать
                                proxy_by_port[port_id] = proxy_by_id[drone_id];
                                resolve(res);
                            } )
                            .catch( reject );

                    }
                    else {
                        Logger.error('UDP port ' + port_id + ' is busy');
                        reject('UDP port ' + port_id + ' is busy');
                    }
                }
                catch(e){
                    Logger.error('Failed to start UDP Proxy at port ' + port_id + ', drone ' + drone_id);
                    Logger.error(e);
                    reject('Error starting UDP server [170]');
                }
            });

        }

        //
        // Остановка UDP Proxy сервера по drone_id или port_id
        // returns Promise
        ,stop: function(drone_id, port_id){

            return new Promise(function(resolve, reject){

                if( drone_id && _.has(proxy_by_id, drone_id) ) proxy_by_id[drone_id].stop().then(resolve).catch(reject);
                else if( port_id && _.has(proxy_by_port, port_id) ) proxy_by_port[port_id].stop().then(resolve).catch(reject);
                else resolve('stopped');

            });

        }

        //
        // Рестарт сервера
        ,restart: function(drone_id, port_id){
            const _this = this;

            return new Promise(function(resolve, reject){
                _this.stop(drone_id)
                    .then( () => _this.start(drone_id, port_id) )
                    .then( resolve )
                    .catch( reject );
            });
        }

    };

}();

module.exports = DroneUDPProxyController;
