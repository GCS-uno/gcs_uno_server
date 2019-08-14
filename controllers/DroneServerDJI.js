"use strict";

const server_config = require('../configs/server_config')
     ,EventEmitter = require('events')
     ,{redisClient, redisClientBuf, redisPubBuf, rHGetAll} = require('../utils/redis')
     ,Logger = require('../utils/logger')
     ,RK = require('./../defs/redis_keys')
     ,IK = require('./../defs/io_keys')
     ,_ = require('lodash')
     ,helpers = require('./../utils/helpers')
     ,{dji_telem1_fields, dji_telem10_fields} = require('./../defs/io_telemetry_fields')
     ,DroneRPCController = require("./DroneRPCController");

const io = require('socket.io-emitter')({ host: server_config.REDIS_HOST, port: server_config.REDIS_PORT });

//
// Подготовка индексов полей телеметрии
const dji_telem1_fi = {};
const dji_telem10_fi = {};
_.forEach(dji_telem1_fields, (value, i) => dji_telem1_fi[value] = i );
_.forEach(dji_telem10_fields, (value, i) => dji_telem10_fi[value] = i );
const nameTelem1Fields = function(data){
    const fields = {};
    data.forEach( (v, i) => { fields[dji_telem1_fields[i]] = v; } );
    return fields;
};


/* InfoController

    Контроллер для хранения текущей информации о дроне

    events emitted to Drone:
        infoChanged (changed_fields) => {}     нужен обработчик для отправки изменений в браузер
        infoLoaded (all_fields) => {}
        isOnline

    event listeners
        telemMessage     !!!  сохранение времени последнего сообщения и установка Онлайн
        isOffline      !!!
        paramsChanged

 */
class DJIInfoController {
    // Конструктор
    constructor(drone){
        // drone = this DroneServer
        // Ссылка на дрон
        this.drone = drone;

        // Начальный набор данных
        this.data = {online: 0, last_message_time: 0};

        // Вызывается для сохранения времени последнего сообщения в редис в заторможенном режиме
        this.save_last_msg_time = _.throttle( () => {
            redisClient.hset(this.drone.data_channels.DRONE_INFO_KEY, 'last_message_time', this.data.last_message_time);
        }, 1000);

        // Загрузка данных из редиса
        this.load().catch(Logger.error);

        // Обновление времени последнего сообщения
        drone.events.on('telemMessage', () => {
            let now = helpers.now();

            // Если дрон был до этого оффлайн, то ставим статус онлайн, сохраняем данные
            if( parseInt(this.data.online) !== 1 ){
                let downtime = now - this.data.last_message_time;
                this.set({online: 1, last_message_time: now, online_from: now });
                drone.events.emit('isOnline', downtime);
            }
            // А иначе просто сохраняем самое последнее время сообщения
            else {
                this.data.last_message_time = now;
                // и сохраняем в редис в заторможенном режиме
                this.save_last_msg_time();
            }

        });

        // Сохранение последнего положения, если дрон ушел в оффлайн
        drone.events.on('isOffline', uptime => {
            let last_lat = drone.telem1.get('lat')
                ,last_lon = drone.telem1.get('lon');

            if( !_.isNil(last_lat) && !_.isNil(last_lon) ){
                this.set({
                    last_pos_lat: last_lat
                    ,last_pos_lon: last_lon
                });
            }
        });

        drone.events.on("paramsChanged", new_params => {
            //console.log("Params changed in info", new_params);
            // Если это новый дрон
            if( ("new" === this.data.model || "new" === this.data.sn) && "new" !== new_params.dji_fc_serial && "new" !== new_params.dji_model ){

                console.log("Set new DJI model and SN");
                this.set({
                    model: new_params.dji_model
                    ,sn: "FC-" + new_params.dji_fc_serial
                });
            }
        });

        // Сообщения с изменениями в инфо дрона
        drone.redis.Sub.subscribe(this.drone.data_channels.DRONE_INFO_CHANNEL);
        // Обработка входящих сообщений
        drone.redis.Sub.on('message', (channel, data) => {

            // Обновление текущей информации
            if( drone.data_channels.DRONE_INFO_CHANNEL === channel ){
                this.set(JSON.parse(data), false); // false = НЕ СОХРАНЯТЬ, тк сюда публикуются уже сохраненные данные
            }

        });

        //
        // Отправка полной информации по запросу не чаще раза в 5 секунд
        this.sendInfo = _.throttle( () => { this.load().then( res => drone.send2io('info', res) ).catch( Logger.error )}, 5000);

        // При удалении и остановке дрона
        drone.events.on('destroy', () => {
            drone.redis.Sub.unsubscribe(this.drone.data_channels.DRONE_INFO_CHANNEL);
        });

    }

    // Загрузка данных из редиса
    load(){
        const _this = this;

        return new Promise(function(resolve, reject){
            rHGetAll(_this.drone.data_channels.DRONE_INFO_KEY)
                .then( res => {
                    _.mapKeys(res, (value, key) => {
                        if( isNaN(parseFloat(value)) ) _this.data[key] = value;
                        else if( parseFloat(value) === parseInt(value) ) _this.data[key] = parseInt(value);
                        else _this.data[key] = parseFloat(value);
                    });

                    if( !_this.data.model || !_this.data.sn ){
                        _this.set({model: _this.drone.data.db_params.dji_model, sn: _this.drone.data.db_params.dji_fc_serial});
                    }

                    _this.drone.events.emit('infoLoaded', _this.data);
                    resolve(_this.data);
                })
                .catch( err => {
                    Logger.error(err);
                    reject('Redis get error key ' + _this.drone.data_channels.DRONE_INFO_KEY)
                } );

        });
    }

    // Запрос информации, возвращается из памяти
    get(field_name=null){
        if( field_name === null ) return this.data;
        else if( _.has(this.data, field_name) ) return this.data[field_name];
        else return 0; // может лучше null? Нет, не созданные поля могут участвоаать в мат вычислениях, поэтому 0
    }

    // Сохранение ИЗМЕНЕННОЙ информации в редисе
    set(new_info, save=true){ // по умолчанию сохраняется в редис
        if( !_.isObject(new_info) ) return;

        let changed_fields = {};

        _.mapKeys(new_info, (value, key) => {
            // Обновляем поле только, если оно изменилось по сравнению с переменной drone_info
            value = parseFloat(value) || value;
            if( !_.has(this.data, key) || this.data[key] !== value ){
                this.data[key] = value;
                changed_fields[key] = value;
                if( save ) redisClient.hset(this.drone.data_channels.DRONE_INFO_KEY, key, value.toString());
            }
        });

        // Измененные поля отправляем в браузер
        if( !_.isEmpty(changed_fields) ) this.drone.events.emit('infoChanged', changed_fields);

    };

    isOnline(){
        return this.data.online === 1;
    }

}

/* HeartbeatController
    проверяет время последнего сообщения и ставит статус ОФФлайн
    отправляет heartbeat на дрон, если есть активные подключения web-приложений (отправляют heartbeat)

           каждую секунду отправляем в канал info статус дрона онлайн или нет, не зависимо от того дрон онлайн или нет
               (в канал info также отправляются изменения информации о дроне для синхронизации с клиентом
               по запросу клиента в канал инфо отправляется полная информация
           если от клиента приходит heartbeat и если дрон онлайн, то
               непрерывно отправляем телеметрию в канал,
               отправляем дрону heartbeat
        */
class DJIHeartbeatController {

    constructor(drone){
        this.drone = drone;
        this.last_gcs_hb = 0; // отметка времени последнего heartbeat от web приложений

        let heartbeat_info = {};
        let heartbeat_interval = null;
        let telem1_interval = null;
        let telem10_interval = null;
        let joystick_interval = null;

        // При изменениии данных, сохраняем здесь для отправки со следующим heartbeat
        drone.events.on('infoChanged', values => _.mapKeys(values, (value, key) => {
            //console.log("Info changed in heartbeat", values);
            heartbeat_info[key] = values[key];
        }));

        //
        // Каждую секунду
        heartbeat_interval = setInterval(() => {
            let now = helpers.now();


            // * 1 *
            // Если дрон онлайн, то проверить время последнего сообщения.
            // Если оно более 2 сек назад, то ставим статус ОФФлайн
            if( drone.info.get('online') && drone.info.get('last_message_time') < now-5 ) {
                drone.info.set({online: 0});
                drone.events.emit('isOffline', (now - drone.info.get('online_from')));
            }


            // * 2 *
            // Отправляем состояние дрона и измененные данные в инфо канал для web приложений
            // Дрон онлайн
            if( drone.info.get('online') ) {
                heartbeat_info.online = 1;
                heartbeat_info.uptime = (now - drone.info.get('online_from'));
            }
            // Дрон оффлайн
            else {
                heartbeat_info.online = 0;
                let lmt = drone.info.get('last_message_time');
                heartbeat_info.downtime = lmt === 0 ? 0 : (now - lmt);
            }
            //
            // отправить данные в io
            drone.send2io('info', heartbeat_info);
            // обнулить объект
            heartbeat_info = {};


            // * 3 *
            // Если подключены web приложения и от них поступает heartbeat и дрон онлайн
            // если сообщение из браузера было менее 3 сек назад
            if( drone.info.get('online') && (now - this.last_gcs_hb) < 3 ){
                //console.log("Send telem");
                // включить трансляцию телеметрии в io, если она отключена
                if( !telem1_interval ){
                    drone.send2io('telem1', drone.telem1.getData());
                    telem1_interval = setInterval( () => {
                        drone.send2io('telem1', drone.telem1.getData());
                    }, 1000);
                }
                if( !telem10_interval ){
                    drone.send2io('telem10', drone.telem10.getData());
                    telem10_interval = setInterval( () => {
                        drone.send2io('telem10', drone.telem10.getData());
                    }, 100);
                }
                // Если в настройках активирован джойстик
                if( !joystick_interval && drone.data.db_params.joystick_enable ) joystick_interval = setInterval( () => {
                    drone.joystick.send2drone();
                }, 100);

            }
            // Иначе отключить трансляцию если включена
            else {

                if( telem1_interval ){
                    clearInterval(telem1_interval);
                    telem1_interval = null;
                }
                if( telem10_interval ){
                    clearInterval(telem10_interval);
                    telem10_interval = null;
                }
                if( joystick_interval ){
                    clearInterval(joystick_interval);
                    joystick_interval = null;
                }
            }

        }, 1000);

        // При удалении и остановке дрона
        drone.events.on('destroy', () => {
            if( heartbeat_interval ){
                clearInterval(heartbeat_interval);
                heartbeat_interval = null;
            }
            if( telem1_interval ){
                clearInterval(telem1_interval);
                telem1_interval = null;
            }
            if( telem10_interval ){
                clearInterval(telem10_interval);
                telem10_interval = null;
            }
            if( joystick_interval ){
                clearInterval(joystick_interval);
                joystick_interval = null;
            }
        });

    }

    // Вызывается контроллером команд для установки времени онлайн
    gcsHeartbeat(){
        this.last_gcs_hb = helpers.now();
    }

}

/* Контроллер телеметрии 1Гц

*/
class DJITelem1Controller {

    constructor(drone){

        this.drone = drone;

        // Пустой массив с кол-вом элементов = кол-во полей в телеметрии 1Гц
        this.data = _.map(new Array(dji_telem1_fields.length), (n) => {return null});

    }

    get(field){
        return _.has(dji_telem1_fi, field) ? this.data[dji_telem1_fi[field]] : undefined;
    }

    set(data){
        //console.log("t1 set", data);

        // Если длина данных не совпадает
        if( data.length !== dji_telem1_fields.length ) return;

        let new_data = nameTelem1Fields(data);

        // Состояние арм / дисарм
        let armed = (new_data.armed ? 1 : 0);
        if( this.get('armed') !== null && this.get('armed') !== armed ) this.drone.events.emit((armed ? 'armed' : 'disarmed'));

        //
        // Обновить данные
        this.data = data;

        // Поставить точку в текущий путь
        let lat = parseFloat(this.get("lat")), lon = parseFloat(this.get("lon"));
        if( lat && lon ) this.drone.flight_path.addPoint(lat, lon);

        //console.log("t1 set", new_data);
        this.drone.events.emit("telemMessage");
    }

    // возврат текущих данных для отправки в браузер, вызывается из heartbeat
    getData(){
        return this.data;
    }

}

/* Контроллер телеметрии 10Гц

 */
class DJITelem10Controller {
    constructor(drone){
        this.drone = drone;

        this.data = _.map(new Array(dji_telem10_fields.length), (n) => {return null});

    }

    get(field){
        return _.has(dji_telem10_fi, field) ? this.data[dji_telem10_fi[field]] : undefined;
    }

    set(data){
        // Если длина данных не совпадает
        if( data.length !== dji_telem10_fields.length ) return;

        // Обновить данные
        this.data = data;

        this.drone.events.emit("telemMessage");
    }

    // возврат текущих данных для отправки в браузер, вызывается из heartbeat
    getData(){
        return this.data;
    }
}

/* Контроллер сохранения пути

 */
class DJIFlightPathController {

    constructor(drone){
        this.drone = drone;
        this.path = []; // array of [lng,lat]

        // Очистить след если дрон дезактивирован
        drone.events.on('armed', () => { this.clear() });

        // Очистить след, если дрон был оффлайн более 60 минут
        drone.events.on('isOnline', downtime => {  if( downtime > 3600 ) this.clear() });

    }

    addPoint(lat, lng){
        // Если дрон дезактивирован, то ничего не делаем
        if( !this.drone.telem1.get('armed') ) return;

        // Добавляем новую точку в след, если разница в сумме координат > X
        let diff = 1;
        if( this.path.length ) diff = Math.abs((Math.abs(lat)+Math.abs(lng))-(Math.abs(this.path[this.path.length-1][1])+Math.abs(this.path[this.path.length-1][0])));
        if( diff >= 0.00005 ){
            this.path.push([lng, lat]);
        }
    }

    getPath(){
        return this.path;
    }

    clear(){
        this.path = [];
    }

}

/* Контроллер команд

 */
class DJICommandController {
    constructor(drone){
        this.drone = drone;

        //
        // Подписка на канал redis откуда приходят команды для дрона
        drone.redis.Sub.subscribe(drone.data_channels.DRONE_UI_COMMANDS);
        // Как только приходит команда, проверяем этот ли канал, и отправляем на преобразование и исполнение
        drone.redis.Sub.on('message', (channel, data) => {
            // Команда с предварительной обработкой из браузера
            if( drone.data_channels.DRONE_UI_COMMANDS === channel ){
                const com_data = JSON.parse(data);
                //console.log("COMMAND RECEIVED", data);

                if( !com_data || !_.has(com_data, 'command') ) return;
                // Выполняем команду
                this.execute(com_data);
            }
        });


        // При удалении и остановке дрона
        drone.events.on('destroy', () => {
            drone.redis.Sub.unsubscribe(drone.data_channels.DRONE_UI_COMMANDS);
        });

    }

    execute(data){

        const _this = this;

        //console.log("DJI command execute", data);

        //
        //     Команды с предобработкой на сервере

        // Запрос полной информации по дрону
        if( 'info' === data.command ) this.drone.info.sendInfo();

        // Heartbeat из браузера
        else if( 'gcs_heartbeat' === data.command ) this.drone.heartbeat.gcsHeartbeat();

        // Запрос полетных режимов
        else if( 'modes_list' === data.command ){
            let modes_list = [];
            if( this.drone.data.modes ){
                _.mapKeys(this.drone.data.modes, (value, key) => {
                    modes_list.push([key, this.drone.data.modes[key].name]);
                });
            }
            this.drone.send2io('modes', modes_list);
        }

        // Отправить точки следа
        else if( 'get_fp' === data.command ){
            _this.drone.send2io('fp', _this.drone.flight_path.getPath());
        }

        // Джойстик
        else if( 'joystick' === data.command && _this.drone.data.db_params.joystick_enable ){

            let jlx = parseInt(data.params.jlx) || 0,
                jly = parseInt(data.params.jly) || 0,
                jrx = parseInt(data.params.jrx) || 0,
                jry = parseInt(data.params.jry) || 0;

            this.drone.joystick.set(jlx, jly, jrx, jry);
        }

        //
        //
        else {

            //
            // Если дрон оффлайн, то ничего не отправляем
            if( !this.drone.info.isOnline() ) {
                this.drone.send2io('com_ack', { command: data.command ,result: 1 }); // Временно отклонен
                return;
            }

            // TODO
            // Установка полетного режима SET_MODE
            if( 'set_mode' === data.command ){

            }
            // Установка полетного режима Guided у дрона
            else if( 'md_guided' === data.command ) {

            }
            // Установка полетного режима Loiter у дрона
            else if( 'md_loiter' === data.command ) {

            }
            // ARM / DISARM
            else if( 'arm' === data.command ){

            }
            // Команда Взлет
            else if( 'takeoff' === data.command ){

            }
            // Полет на точку
            else if( 'nav2p' === data.command ) {

            }
            // Команда Посадка
            else if( 'land' === data.command ) {

            }
            // Команда RTL
            else if( 'rtl' === data.command ) {

            }
        }

    }

}

/* Контроллер джойстика

 */
class DJIJoystickController {
    constructor(drone){
        this.drone = drone; // ссылка на экземпляр дрона
        this.last_pos_time = 0; // timestamp последних данных из браузера
        this.pos_data = { jlx: 0 ,jly: 0 ,jrx: 0 ,jry: 0 };
        this.last_sent_pos_data = { jlx: 0 ,jly: 0 ,jrx: 0 ,jry: 0 };
    }

    // Установка положения джойстика, вызывается в CommandController
    set(jlx, jly, jrx, jry){

        // обновить время последних данных
        this.last_pos_time = helpers.now();

        const consider_limits = function(v){
            if( v > 50 ) v = 50;
            if( v < -50 ) v = -50;
            return v;
        };

        // Выставить лимиты
        this.pos_data.jlx = consider_limits(jlx);
        this.pos_data.jly = consider_limits(jly);
        this.pos_data.jrx = consider_limits(jrx);
        this.pos_data.jry = consider_limits(jry);

    }

    // Вызывается в heartbeat если подключены дрон и gcs в браузере, а также джойстик включен в настройках
    send2drone(){

        // Если данные старые, то ничего не отправляем
        if( (helpers.now() - this.last_pos_time) > 3 ) return;

        // Если моторы не запущены, ничего не отправляем
        if( !this.drone.telem1.get('armed') ) return;

        // TODO отправить джойстик в приложение

    }

}



class DJIDroneServer {

    //
    // Конструктор дрона
    constructor(params){
        /* params. = все поля из таблицы БД */

        const _this = this;
        this.id = params.id;

        // проверка времени инициализации
        let start_time = helpers.now_ms();

        // инициализация клиентов редис
        this.redis = {
            Sub: redisClient.duplicate(),
            Pub: redisClient.duplicate(),
            SubBuf: redisClientBuf.duplicate()
        };

        /* Event emitter
            infoChanged (changed_fields) => {}     нужен обработчик для отправки изменений в браузер
            infoLoaded (all_fields) => {}
            isOnline (downtime) => {} время доунтайм в секундах
            isOffline (uptime) => {} время аптайм в секундах
            paramsChanged () => {}
            destroy () => {}
            armed () => {}
            disarmed () => {}
            telemMessage () => {}
         */
        this.events = new EventEmitter();

        // Каналы redis и IO, редис точка хранения информации о дроне DRONE_INFO_KEY
        this.data_channels = {
            DJI_IO_FROM_DRONE: RK.DJI_IO_FROM_DRONE(_this.id) // Телеметрия из приложения
            , DJI_IO_TO_DRONE: RK.DJI_IO_TO_DRONE(_this.id) // Команды в приложение
            , DRONE_UI_COMMANDS: RK.DRONE_UI_COMMANDS(_this.id) // Канал с командами из браузера
            , DRONE_INFO_CHANNEL: RK.DRONE_INFO_CHANNEL(_this.id) // Канал с информацией
            , DRONE_INFO_KEY: RK.DRONE_INFO_KEY(_this.id) // Переменая с информацией о дроне
            , DRONE_IO_ROOM: IK.DRONE_IO_ROOM(_this.id) // Канал в io для исходящей телеметрии дрона
        };

        // Внутренние данные дрона
        this.data = {
            // список полетных режимов
            modes: null
            ,db_params: params // Параметры из БД
        };

        // Отправка сообщений в web приложение
        this.send2io = function (event, data) {
            io.to(_this.data_channels.DRONE_IO_ROOM).emit(event + '_' + _this.id, data)
        };

        // Отправка сообщений дрону
        this.send2drone = function (event, data) {
            _this.redis.Pub.publish(_this.data_channels.DJI_IO_TO_DRONE, JSON.stringify({
                event: event,
                data: data
            }));
        };

        //
        // Контроллеры
        this.info = new DJIInfoController(this);
        this.heartbeat = new DJIHeartbeatController(this);
        this.telem1 = new DJITelem1Controller(this);
        this.telem10 = new DJITelem10Controller(this);
        this.flight_path = new DJIFlightPathController(this);
        this.RPC = new DroneRPCController(this);
        this.commands = new DJICommandController(this);
        this.joystick = new DJIJoystickController(this);


        //
        // Подписка на сообщения от дрона, которые сервер отправляет в редис
        this.redis.Sub.subscribe(this.data_channels.DJI_IO_FROM_DRONE);
        // Приходит сообщение
        this.redis.Sub.on('message', (channel, data) => {
            // Проверяем нужный ли это канал
            if (this.data_channels.DJI_IO_FROM_DRONE === channel) {
                if (data) {
                    let telem = JSON.parse(data); // [ 'at', [ 1, '0', '0', '42' ] ]
                    //console.log(telem);
                    if (telem[0] === "ct" && telem[1]) this.telem1.set(telem[1]);
                    else if (telem[0] === "at" && telem[1]) this.telem10.set(telem[1]);
                }
            }
        });


        Logger.info(`DroneServerDJI started (${helpers.now_ms() - start_time}ms) for ${this.data.db_params.name}`);

    }

    //
    // Обновление параметров из БД
    update(data){

        // Переписать параметры в памяти
        _.mapKeys(data, (v, k) => { this.data.db_params[k] = v; });

        // Сообщить всем, что параметры изменены
        this.events.emit('paramsChanged', this.data.db_params);

    }

    //
    // Вызывается перед уничтожением экземпляра на сервере
    destroy(){

        // Обнулить все периодические функции и подписки
        this.events.emit('destroy');

        Logger.info('DroneServer destroyed ' + this.id);

    }

}


module.exports = DJIDroneServer;
