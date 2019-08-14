/*

        GCS TCP Proxy
        Связь GCS с дроном по TCP

 */

const {redisClient, redisClientBuf, redisPub, redisPubBuf} = require('../utils/redis')
    ,RK = require('../defs/redis_keys')
    ,net = require('net')
    ,Logger = require('../utils/logger')
    ,_ = require('lodash')
    ,common_config = require('../configs/common_config')
    ,proxy_by_port = {}
    ,proxy_by_id = {}
                                    ; /////


class GCSTCPProxy {

    // Конструктор
    constructor(drone_id, port_id){

        this.MAVLINK_TO_DRONE = RK.MAVLINK_TO_DRONE(drone_id);
        this.MAVLINK_FROM_DRONE = RK.MAVLINK_FROM_DRONE(drone_id);
        this.DRONE_INFO_KEY = RK.DRONE_INFO_KEY(drone_id);
        this.DRONE_INFO_CHANNEL = RK.DRONE_INFO_CHANNEL(drone_id);

        this.drone_id = drone_id;
        this.port_id = port_id;

        this.client = null;
        this.tcp_server = null;

        this.redisSubBuf = null;

        const _this = this;

        //
        // Сохранение в дроне статуса UDP сервера
        this.save_gcs_tcp_status = function(status, message){
            redisClient.hmset(_this.DRONE_INFO_KEY, 'tcp_op_s',status, 'tcp_op_c',message, function(err){
                if( err ){
                    Logger.error('Error set redis keys');
                    return;
                }

                redisPub.publish(_this.DRONE_INFO_CHANNEL, JSON.stringify({tcp_op_s: status, tcp_op_c: message}));
            });
        };

    }

    // Старт сервера
    start(){

        const _this = this;

        return new Promise(function (resolve, reject) {
            try {
                //
                // Подписываемся на редис-канал с mavlink сообщениями от дрона
                _this.redisSubBuf = redisClientBuf.duplicate();
                _this.redisSubBuf.subscribe(_this.MAVLINK_FROM_DRONE);
                _this.redisSubBuf.on('message', function(channel, message){

                    // Если сообщение больше  максимума или клиент не подключен
                    if( message.length > 500 || !_this.client ) return;

                    // Проверка канала
                    if( channel.toString() === _this.MAVLINK_FROM_DRONE ){
                        _this.client.write(message);
                    }

                });

                //
                // Создание экземпляра сервера
                _this.tcp_server = net.createServer();

                // Максимальное кол-во соединений
                _this.tcp_server.maxConnections = 1;

                // При соединении нового клиента
                _this.tcp_server.on('connection', client => {
                    const client_addr = `${client.remoteAddress}:${client.remotePort}`;

                    Logger.info(`Client connected from ${client_addr}, port ${_this.port_id}`);

                    // Если уже есть соединение с подключенным клиентом, то новое обрываем
                    if( _this.client ){
                        client.destroy();
                        return;
                    }

                    // Новое соединение
                    _this.client = client;

                    _this.client
                        .setTimeout(600000)
                        .setKeepAlive(true)
                        .setNoDelay(true);

                    // Закрытие соединения с клиентом
                    const close_connection = function(){
                        Logger.info(`TCP client closed on port ${_this.port_id}, ${client_addr}`);
                        if( _this.client && _this.client.destroy) _this.client.destroy();
                        _this.save_gcs_tcp_status(1, `No GCS connected`);
                        _this.client = null;
                        // если соединение было закрыто с ошибкой, то ее пишет обработчик on_error
                    };

                    // Logging the message on the server
                    Logger.info(`GCS connected to port ${_this.port_id} from ${client_addr}`);

                    // Установка состояния сервера в информацию дрона
                    _this.save_gcs_tcp_status(1, `GCS connected from ${client.remoteAddress}`);

                    // Принимаем данные от GCS и отправляем в канал редис
                    _this.client.on('data', (data) => {
                        // и отправляем
                        redisPubBuf.publish(_this.MAVLINK_TO_DRONE, data);
                        // а также отправляем в канал для мониторинга
                        redisPubBuf.publish(RK.MAVLINK_TO_DRONE_MONITOR(), data);
                    });

                    // При отсоединении клиента
                    _this.client.on('end', close_connection);

                    // В случае закрытия соединения
                    _this.client.on('close', close_connection);

                    // Закрытие соединения по таймауту
                    _this.client.on('timeout', close_connection);

                    // В случае ошибки соединения
                    _this.client.on('error', (e) => {
                        Logger.error(`TCP server error on port ${_this.port_id}, client ${client_addr}`);
                        Logger.error(e);
                        // следом вызывается событие close
                    });

                    /*
                     статистика сокета
                        socket.bytesRead
                        socket.bytesWritten


                     */

                });

                // После остановки сервера
                _this.tcp_server.on('close', () => {
                    Logger.info(`TCP server STOPPED, port ${_this.port_id}`);
                    _this.save_gcs_tcp_status(0, 'stopped');
                    _this.destroy();
                    reject('closed');
                });

                // При ошибке соединения
                _this.tcp_server.on('error', err => {
                    Logger.error('TCP server failed to start');
                    Logger.error(err);
                    _this.tcp_server.close();
                });

                // При старте сервера
                _this.tcp_server.on('listening', () => {
                    Logger.info(`TCP server started on port ${_this.port_id}`);
                    _this.save_gcs_tcp_status(1, `Running on port ${_this.port_id}`);
                    resolve('started');
                });

                //
                // Старт сервера
                _this.tcp_server.listen(_this.port_id);

            }
            catch (e ){
                reject('failed to start');
                Logger.error(`Failed to start TCP on port ${_this.port_id}`);
                Logger.error(e);
            }
        });

    }

    // Остановка сервера
    stop(){

        const _this = this;

        return new Promise(function(resolve, reject){
            try {
                // Если клиент подключен, то отключаем его
                if( _this.client ) _this.client.destroy();
                // Останавливаем сервер. События остановки выполняются в обработчике выше on_close
                _this.tcp_server.close( () => resolve('stopped') );
                // this.destroy вызывается в обработчике закрытия

            }
            catch( e ){
                Logger.info('Failed to stop TCP server at ' + _this.port_id);
                reject('failed to stop');
            }
        });

    }

    // Уничтожение ссылок на себя
    destroy(){
        this.redisSubBuf.unsubscribe(this.MAVLINK_FROM_DRONE);

        _.unset(proxy_by_port, this.port_id);
        _.unset(proxy_by_id, this.drone_id);
    }

}



const GCSTCPProxyController = function(){

    return {

        // Запуск сервера
        start: function(drone_id, port_id){

            return new Promise(function(resolve, reject){
                try {

                    if( port_id < common_config.GCS_TCP_PORT_MIN || port_id > common_config.GCS_TCP_PORT_MAX ){
                        return reject('Invalid TCP port ' + port_id + ' for drone ' + drone_id);
                    }
                    if( !drone_id ){
                        return reject('No drone id');
                    }

                    // Если сервер уже запущен, то возвращаем resolve
                    if( _.has(proxy_by_id, drone_id) ){
                        return resolve('running');
                    }

                    // Если запрашиваемый порт не занят, запускаем на нем сервер
                    if( !_.has(proxy_by_port, port_id) ){

                        // Создаем новый прокси на порт UDP
                        let new_tcp_proxy = new GCSTCPProxy(drone_id, port_id);
                        new_tcp_proxy.start()
                            // Если получилось создать
                            .then( res => {
                                proxy_by_id[drone_id] = new_tcp_proxy;
                                proxy_by_port[port_id] = proxy_by_id[drone_id];
                                resolve(res);
                            } )
                            .catch( reject );
                    }
                    else {
                        Logger.error('TCP port ' + port_id + ' is busy');
                        reject('TCP port ' + port_id + ' is busy');
                    }

                }
                catch(e){
                    Logger.error('Failed to start TCP Proxy at port ' + port_id + ', drone ' + drone_id);
                    Logger.error(e);
                    reject('Error starting TCP server [174]');
                }
            });

        }

        // Остановка сервера
        ,stop: function(drone_id, port_id){

            return new Promise(function(resolve, reject){
                if( drone_id && _.has(proxy_by_id, drone_id) ){
                    proxy_by_id[drone_id].stop().then(resolve).catch(reject);
                }
                else if( port_id && _.has(proxy_by_port, port_id) ){
                    proxy_by_port[port_id].stop().then(resolve).catch(reject);
                }
                else resolve();
            });
        }

        // Перезапуск сервера
        ,restart: function(drone_id, port_id){
            const _this = this;

            return new Promise(function(resolve, reject){
                _this.stop(drone_id)
                    .then( () => _this.start(drone_id, port_id) )
                    .then( resolve )
                    .catch( reject );
            });
        }

    }

}();


module.exports = GCSTCPProxyController;
