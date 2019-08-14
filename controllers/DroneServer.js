"use strict";

const common_config = require('../configs/common_config')
     ,server_config = require('../configs/server_config')
     ,MAVLink = require('./../utils/mavlink2/mavlink2')
     ,EventEmitter = require('events')
     ,{redisClient, redisClientBuf, redisPubBuf, rHGetAll, RPC} = require('../utils/redis')
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
     ,DataFlashLog = require('../utils/dataflash_logs')
     ,DroneRPCController = require("./DroneRPCController");

const io = require('socket.io-emitter')({ host: server_config.REDIS_HOST, port: server_config.REDIS_PORT });

const systemRPC = RPC;

//
// Подготовка индексов полей телеметрии
const telem1_fi = {};
const telem10_fi = {};
_.forEach(telem1_fields, (value, i) => telem1_fi[value] = i );
_.forEach(telem10_fields, (value, i) => telem10_fi[value] = i );


//
// Загрузка миссии с борта
class MissionDownloadController {

    constructor(drone){
        this.drone = drone;
        this.in_progress = false;
        this.count = 0;
        this.waiting_seq = null;
        this.waiting_count = null; // true
        this.mission_count = 0;

        this.resolve = null;
        this.reject = null;

        this.request_list_tries = 0;
        this.request_item_tries = 0;

        this.mission_items = [];

        const _this = this;

        // Таймаут запроса MISSION_REQUEST_LIST
        this.request_list_timeout = null;
        this.request_list_timeout_func = function(){

            _this.request_list_tries++;

            // Попытаться отправить 5 раз, если предыдущий не прошел
            if( _this.request_list_tries > 5 ){
                _this.reject('max MISSION_REQUEST_LIST retries');
                _this.in_progress = false;
                _this.waiting_count = false;
                _this.waiting_seq = null;
                _this.request_list_tries = 0;
                _this.mission_count = 0;
            }
            else {
                _this._request_list();
            }
        };

        this.request_item_timeout = null;
        this.request_item_timeout_func = function(){
            _this.request_item_tries++;

            if( _this.request_item_tries > 5 ){
                _this.reject('max MISSION_REQUEST retries');
                _this.in_progress = false;
                _this.waiting_seq = null;
                _this.request_item_tries = 0;
            }
            else {
                _this._request_mission_item(_this.waiting_seq);
            }
        };

        // 39 MISSION_ITEM Сообщение с элементом миссии
        drone.mavlink.on('MISSION_ITEM', fields => this.mav_mission_item(fields) );

        // 44 MISSION_COUNT Сообщение с кол-вом элементов в миссии на борту
        drone.mavlink.on('MISSION_COUNT', fields => this.mav_mission_count(parseInt(fields.count)) );


    }

    //
    // Начинаем запрос данных бортовой миссии
    start(){ //
        const _this = this;

        return new Promise(function(resolve, reject){
            // Если процесс в работе, то возвращаемся
            if( _this.in_progress ) return reject('in progress');

            _this.in_progress = true;

            // Иначе назначаем завершающие функции
            _this.resolve = resolve;
            _this.reject = reject;

            // Отправляем запрос на борт
            _this._request_list();
        });

    }

    //
    // Отправка запроса на список элементов в миссии
    _request_list(){
        const _this = this;

        _this.waiting_count = true; // Ожидание сообщения MISSION_COUNT
        _this.mission_count = 0;  // Обнуляем кол-во элементов
        _this.mission_items = [];

        // Отправляем запрос на кол-во элементов
        _this.drone.mavlink.sendMessage('MISSION_REQUEST_LIST', {
            target_system: _this.drone.mavlink.sysid
            ,target_component: _this.drone.mavlink.compid
        });

        // Таймаут на выполнение запроса = 5 секунд
        _this.request_list_timeout = setTimeout(() => _this.request_list_timeout_func(), 5000);

        // Ожидание сообщения MISSION_COUNT и вызова функции mav_mission_count()
    }

    //
    // Вызывается в сообщениии MISSION_COUNT
    mav_mission_count(count){
        const _this = this;

        // Обнуляем таймаут запроса кол-ва элементов
        if( _this.request_list_timeout ){
            clearTimeout(_this.request_list_timeout);
            _this.request_list_timeout = undefined;
            _this.request_list_tries = 0;
        }

        // Если загрузка в процессе и ожидается MISSION_COUNT
        if( _this.in_progress && _this.waiting_count ){

            _this.waiting_count = false;

            if( count === 0 ){
                _this.reject('no_mission');
                _this.in_progress = false;
            }
            else {
                // В ArduPilot самый первый элемент - это планируемая точка старта, в миссии не учитывается
                if( 3 === _this.drone.data.autopilot ){
                    if( count < 2 ){
                        _this.reject('no_mission');
                        _this.in_progress = false;
                    }
                    else {
                        _this.mission_count = count;
                        _this._request_mission_item(1);
                    }
                }

                // TODO Другие типы автопилотов
                // В PX4 первый элемент элемент - это и есть первый элемент
                else {
                    _this.mission_count = count;
                    _this._request_mission_item(0);
                }

            }
        }
    }

    //
    // Запрос на элемент миссии по номеру
    _request_mission_item(seq){
        const _this = this;

        _this.waiting_seq = seq;

        // Отправляем запрос на кол-во элементов
        _this.drone.mavlink.sendMessage('MISSION_REQUEST', {
            target_system: _this.drone.mavlink.sysid
            ,target_component: _this.drone.mavlink.compid
            ,seq: seq
        });

        // Ставим таймаут на выполенение запроса
        _this.request_item_timeout = setTimeout(_this.request_item_timeout_func, 4000);
    }

    //
    // Пришло сообщение с элементом
    mav_mission_item(item){
        const _this = this;

        // Если пришел тот элемент, который нужен, добавляем его в коллекцию
        if( parseInt(item.seq) === _this.waiting_seq && _this.in_progress ){

            if( _this.request_item_timeout ) clearTimeout(_this.request_item_timeout);

            _this.mission_items.push(item);

            // Если это не последний элемент, то запросить следующий
            if( item.seq+1 < _this.mission_count ){
                _this._request_mission_item(item.seq+1);
            }

            // А если последний, то отправляем MISSION_ACK
            else {
                _this.waiting_seq = null;
                _this._mission_ack();
            }
        }

    }

    //
    // Подтверждение загрузки миссии
    _mission_ack(){
        const _this = this;

        // Отправляем подтверждение
        _this.drone.mavlink.sendMessage('MISSION_ACK', {
            target_system: _this.drone.mavlink.sysid
            ,target_component: _this.drone.mavlink.compid
            ,type: 0 // success MAV_MISSION_RESULT
        });

        _this.resolve(_this.mission_items);
        _this.in_progress = false;

    }

    //
    // Запрос координат точки
    getWP(seq){
        const _this = this;

        // Если нет миссии
        if( !_this.mission_items.length || _this.mission_items.length < seq) return null;

        // Ardupilot
        if( 3 === this.drone.data.autopilot ){

            // если это последняя команда 16 с координатами 0, то это RTL
            if( seq === _this.mission_items.length && _this.mission_items[seq-1].command === 20 ){
                return [this.drone.info.get('h_pos_lat'), this.drone.info.get('h_pos_lon'), 'h'];
            }

            if( !_this.mission_items[seq-1].x && !_this.mission_items[seq-1].y ) return null;

            return [_this.mission_items[seq-1].x, _this.mission_items[seq-1].y, 'm']; // lat, lng

        }

        // PX4
        else if( 12 === this.drone.data.autopilot ){
            // если это последняя команда 16 с координатами 0, то это RTL
            if( seq+1 === _this.mission_items.length && _this.mission_items[seq].command === 20 ){
                return [this.drone.info.get('h_pos_lat'), this.drone.info.get('h_pos_lon'), 'h'];
            }

            if( !_this.mission_items[seq].x && !_this.mission_items[seq].y ) return null;

            return [_this.mission_items[seq].x, _this.mission_items[seq].y, 'm']; // lat, lng

        }

        // TODO other types
        else {

        }

        return null;
    }

}

//
// Выгрузка миссии на борт
class MissionUploadController {

    constructor(drone){

        this.drone = drone;
        this.in_progress = false;
        this.progress_count = 0;
        this.count = 0;
        this.mission_count = 0;
        this.items_sent = 0;
        this.last_seq_sent = 0;

        this.resolve = null;
        this.reject = null;

        this.mission_count_tries = 0;

        this.mission_items = [];

        const _this = this;

        this.mission_count_timeout = null;
        this.mission_count_timeout_func = function(){
            _this.mission_count_tries++;

            // Попытаться отправить 5 раз, если предыдущий не прошел
            if( _this.mission_count_tries > 5 ){
                _this.reject('max MC retries');
                _this.clear();
            }
            else {
                _this._mission_count();
            }
        };

        this.mission_item_timeout = null;
        this.mission_item_timeout_func = function(){
            _this.clear();
        };

        this.item_to_send_timeout = null;


        // 40 MISSION_REQUEST Сообщение с запросом на элемент миссии
        drone.mavlink.on('MISSION_REQUEST', fields => this.mission_request(parseInt(fields.seq)) );

        // 47 MISSION_ACK Сообщение с подтверждением приема элементов миссии
        drone.mavlink.on('MISSION_ACK', fields => this.mission_ack(parseInt(fields.type)) );

    }


    start(mission_data){

        const _this = this;

        return new Promise(function(resolve, reject){

            if( !mission_data.length ) return reject('empty data'); //

            if( _this.in_progress ) return reject('in progress'); //

            // Готовимся к отправке запроса
            _this.clear();

            // Начинаем процесс
            _this.in_progress = true;

            _this.mission_items = mission_data;
            _this.mission_count = mission_data.length;

            _this.resolve = resolve;
            _this.reject = reject;

            _this._mission_count();

        });
    }


    // Отправка запроса на передачу элементов миссии MISSION_COUNT
    _mission_count(){
        const _this = this;

        // Отправляем запрос на запись элементов
        _this.drone.mavlink.sendMessage('MISSION_COUNT', {
            target_system: _this.drone.mavlink.sysid
            ,target_component: _this.drone.mavlink.compid
            ,count: _this.mission_count
        });

        // Таймаут на выполнение запроса = 5 секунд. Если не придет ответ в mission_request, то выполнить 5 раз
        _this.mission_count_timeout = setTimeout(_this.mission_count_timeout_func, 5000);

    }

    // Пришел запрос элемента от борта
    mission_request(item_seq){
        const _this = this;

        if( !_this.in_progress ) return;

        // Отменяем таймаут отправки запроса на запись, если он еще не отменен
        if( _this.mission_count_timeout ){
            clearTimeout(_this.mission_count_timeout);
            _this.mission_count_timeout = null;
        }

        if( _this.mission_item_timeout ){
            clearTimeout(_this.mission_item_timeout);
            _this.mission_item_timeout = null;
        }

        // Если отправлено очень много сообщений
        if( _this.items_sent >= _this.mission_count*2 ){
            _this.reject('items over sent'); //
            _this.clear();
            return;
        }

        // Если нет запрашиваемого элемента
        if( !_this.mission_items[item_seq] ){
            _this.reject('wrong seq'); //
            _this.clear();
            return;
        }

        _this._mission_item(item_seq);

    }

    // Отправляем элемент
    _mission_item(item_seq){
        const _this = this;

        if( !_this.in_progress ) return;

        // рассчитаем прогресс %
        let p = Math.floor(item_seq * 100 /_this.mission_count);
        if( p > _this.progress_count ){
            _this.progress_count = p;
            _this.drone.send2io('fp_upl_progress', p);
        }

        _this.drone.mavlink.sendMessage('MISSION_ITEM', _this.mission_items[item_seq]);
        _this.items_sent += 1;
        _this.last_seq_sent = item_seq;

        _this.mission_item_timeout = setTimeout(_this.mission_item_timeout_func, 5000);

    }

    // Получаем подтверждение о приеме последнего элемента
    mission_ack(result){
        /*
            0	MAV_MISSION_ACCEPTED	mission accepted OK
            1	MAV_MISSION_ERROR	generic error / not accepting mission commands at all right now
            2	MAV_MISSION_UNSUPPORTED_FRAME	coordinate frame is not supported
            3	MAV_MISSION_UNSUPPORTED	command is not supported
            4	MAV_MISSION_NO_SPACE	mission item exceeds storage space
            5	MAV_MISSION_INVALID	one of the parameters has an invalid value
            6	MAV_MISSION_INVALID_PARAM1	param1 has an invalid value
            7	MAV_MISSION_INVALID_PARAM2	param2 has an invalid value
            8	MAV_MISSION_INVALID_PARAM3	param3 has an invalid value
            9	MAV_MISSION_INVALID_PARAM4	param4 has an invalid value
            10	MAV_MISSION_INVALID_PARAM5_X	x/param5 has an invalid value
            11	MAV_MISSION_INVALID_PARAM6_Y	y/param6 has an invalid value
            12	MAV_MISSION_INVALID_PARAM7	param7 has an invalid value
            13	MAV_MISSION_INVALID_SEQUENCE	received waypoint out of sequence
            14	MAV_MISSION_DENIED	not accepting any mission commands from this communication partner
         */

        const _this = this;

        if( !_this.in_progress ) return;

        if( 0 === result ) _this.resolve();
        else _this.reject('MR=' + result + ' seq:' +  _this.last_seq_sent + ' cmd: ' + _this.mission_items[_this.last_seq_sent].command);

        _this.clear();

    }

    // Сбросить процесс
    clear(){

        this.in_progress = false;
        this.progress_count = 0;
        this.mission_count = 0;
        this.mission_items = null;
        this.items_sent = 0;

        if( this.mission_count_timeout ) clearTimeout(this.mission_count_timeout);
        this.mission_count_timeout = null;

        this.resolve = null;
        this.reject = null;

    }

}

//
// контроллер mavlink
function MAVLinkController(drone){
    const mavlink = new MAVLink(drone.data.db_params.mav_sys_id, drone.data.db_params.mav_cmp_id, drone.data.db_params.mav_gcs_sys_id, drone.data.db_params.mav_gcs_cmp_id);

    //
    // Подписка на канал Redis с чистым MAVlink
    drone.redis.SubBuf.subscribe(drone.data_channels.MAVLINK_FROM_DRONE);
    // Сюда приходят MAVLink сообщения от дрона (0xFD, 0xFE)
    drone.redis.SubBuf.on('message', function(channel, message){
        if( drone.data_channels.MAVLINK_FROM_DRONE !== channel.toString() ) return;

        // распарсить сообщение, далее вызываются mavlink.messageHandler, mavlink.errorHandler
        setTimeout(() => mavlink.parse(message), 0); // далее сообщения в событиях

        // зафиксировать время сообщения
        drone.events.emit('mavlinkMessage');

        // посчитать счетчик общего кол-ва
        drone.data.message_counters.total += 1;

    });

    // Назначение функции отправителя сообщений на борт
    mavlink.sender = function(err, message_buffer){
        // Если дрон не онлайн, тогда ничего не делаем
        if( err || !drone.info.get('online') || !_.isBuffer(message_buffer) || !message_buffer.length ) return;

        redisPubBuf.publish(drone.data_channels.MAVLINK_TO_DRONE, message_buffer);
        redisPubBuf.publish(RK.MAVLINK_TO_DRONE_MONITOR(), message_buffer);
    };

    // Обработка mavlink ошибок
    mavlink.errorHandler = function(err, err_msg){
        if( 'seqError' !== err ) Logger.info('MAV ERR' + ' ' + err + '  ' + (err_msg || ''));
        drone.data.message_counters.errors += 1;
    };

    // При изменении параметров дрона меняем параметры mavlink
    drone.events.on('paramsChanged', () => {
        drone.mavlink.sysid = drone.data.db_params.mav_sys_id;
        drone.mavlink.compid = drone.data.db_params.mav_cmp_id;
        drone.mavlink.gcs_sysid = drone.data.db_params.mav_gcs_sys_id;
        drone.mavlink.gcs_compid = drone.data.db_params.mav_gcs_cmp_id;
    });

    // При удалении и остановке дрона
    drone.events.on('destroy', () => {
        drone.redis.SubBuf.unsubscribe(drone.data_channels.MAVLINK_FROM_DRONE);
    });


    //
    //   Обработка входящих сообщений в контроллерах

    // 253 STATUSTEXT Сообщения со статусом
    mavlink.on('STATUSTEXT', fields => drone.send2io('status_text', fields));

    return mavlink;

}


/* InfoController

    Контроллер для хранения текущей информации о дроне

    events emitted to Drone:
        infoChanged (changed_fields) => {}     нужен обработчик для отправки изменений в браузер
        infoLoaded (all_fields) => {}
        isOnline

    event listeners
        mavMessage     !!!  сохранение времени последнего сообщения и установка Онлайн
        isOffline      !!!

 */
class InfoController {
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
        drone.events.on('mavlinkMessage', () => {
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

        // Установка и обновление точки возврата
        drone.mavlink.on('HOME_POSITION', (fields) => {
            this.set({
                h_pos_lat: fields.latitude/10000000
                ,h_pos_lon: fields.longitude/10000000
            });
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
    get(field_name){
        if( !field_name ) return this.data;
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
           если от клиента приходит heartbeat, то
               непрерывно отправляем телеметрию в канал, если дрон онлайн
               отправляем дрону heartbeat
        */
class HeartbeatController {

    constructor(drone){
        this.drone = drone;
        this.last_gcs_hb = 0; // отметка времени последнего heartbeat от web приложений

        let heartbeat_info = {};
        let heartbeat_interval = null;
        let telem1_interval = null;
        let telem10_interval = null;
        let joystick_interval = null;

        // При изменениии данных, сохраняем здесь для отправки со следующим heartbeat
        drone.events.on('infoChanged', values => _.mapKeys(values, (value, key) => { heartbeat_info[key] = values[key] }));

        // 0 HEARTBEAT от дрона
        drone.mavlink.on('HEARTBEAT', fields => {
            // Если автопилот и рама еще не установлены или поменялись в процессе
            // Установка типов автопилота и рамы
            if( drone.data.type !== fields.type || drone.data.autopilot !== fields.autopilot ){

                // Сохраним параметры
                drone.data.type = fields.type; // тип в цифровом виде
                drone.data.autopilot = fields.autopilot; // автопилот в цифровом виде

                // Определим тип автопилота в текстовом виде для показа пользователю
                if( _.has(AUTOPILOTS, fields.autopilot) ) drone.info.set({at: AUTOPILOTS[fields.autopilot]}); // автопилот
                else drone.info.set({at: 'Unknown autopilot'});

                //
                // Установить какие полетные режимы будут использоваться

                // Полетные режимы по умолчанию
                drone.data.modes_type = 'base';
                drone.data.modes = FLIGHT_MODES.generic_base;

                // Определим тип установки
                if( _.has(FRAME_TYPES, drone.data.type) ) {
                    drone.info.set({ft: FRAME_TYPES[drone.data.type][0], ac: FRAME_TYPES[drone.data.type][1]});

                    // Установка полетных режимов
                    if( _.has(FLIGHT_MODES, drone.data.autopilot) && _.has(FLIGHT_MODES[drone.data.autopilot], FRAME_TYPES[drone.data.type][1]) ){
                        drone.data.modes_type = 'custom';
                        drone.data.modes = FLIGHT_MODES[drone.data.autopilot][FRAME_TYPES[drone.data.type][1]];
                    }
                }
                // Не известная установка
                else drone.info.set({ft: 'unknown 2', ac: 'other'});

            }

            fields.base_mode = parseInt(fields.base_mode);
            fields.custom_mode = parseInt(fields.custom_mode);

            //
            // Состояние арм / дисарм
            let armed = (128 & fields.base_mode ? 1 : 0);
            if( drone.telem1.get('armed') !== null && drone.telem1.get('armed') !== armed ) drone.events.emit((armed ? 'armed' : 'disarmed'));
            drone.telem1.set('armed', armed);

            //
            // Включен ли ручной режим управления
            drone.telem1.set('rc', (64 & fields.base_mode ? 1 : 0));

            // Определить полетный режим из списка
            // Если включен CUSTOM MODE
            if( 1 & fields.base_mode && 'custom' === drone.data.modes_type ){
                drone.telem1.set('mode', fields.custom_mode);
            }

            // или же управление через BASE MODE
            else {

                // MANUAL стоит первым, тк может быть вклчен в других режимах. Если других режимов нет, то останется этот
                if( 64 & fields.base_mode ) drone.telem1.set('mode', 1);

                // STABILIZE
                if( 16 & fields.base_mode ) drone.telem1.set('mode', 2);

                // GUIDED
                if( 8 & fields.base_mode ) drone.telem1.set('mode', 3);

                // AUTO
                if( 4 & fields.base_mode ) drone.telem1.set('mode', 4);

            }

            // Состояние автопилота
            if( fields.system_status < MAV_STATE.length ) drone.telem1.set('sys_status', MAV_STATE[fields.system_status]);

        });

        //
        // Каждую секунду
        heartbeat_interval = setInterval(() => {
            let now = helpers.now();


            // * 1 *
            // Если дрон онлайн, то проверить время последнего сообщения.
            // Если оно более 2 сек назад, то ставим статус ОФФлайн
            if( drone.info.get('online') && drone.info.get('last_message_time') < now-2 ) {
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
                // отправляем heartbeat на дрон
                drone.mavlink.sendMessage('HEARTBEAT', {
                    type: 6 // GCS
                    ,autopilot: 0 // Generic
                    ,system_status: 4 // Active
                });

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

//
// Контроллер телеметрии 1Гц
class Telem1Controller {

    constructor(drone){

        let dest_point_timeout = 0;
        let global_pos_last = 0;
        let mission_current = 0;
        this.block_dest_point_clear = false;

        // Пустой массив с кол-вом элементов = кол-во полей в телеметрии 1Гц
        this.data = _.map(new Array(telem1_fields.length), (n) => {return null});

        // 1 SYS_STATUS
        drone.mavlink.on('SYS_STATUS', fields => {
            this.set('bat_v', (fields.voltage_battery / 1000).toFixed(1));
            this.set('bat_c', fields.current_battery);
            this.set('bat_rem', fields.battery_remaining);
            this.set('sys_load', Math.round(fields.load/10));
        });

        // 2 SYSTEM_TIME
        drone.mavlink.on('SYSTEM_TIME', fields => {
            this.set('time_b', Math.round(fields.time_boot_ms/1000));
        });


        const _this = this;
        const position_parse = function(lat, lon, alt){
            _this.set('alt', alt);
            _this.set('lat', lat);
            _this.set('lon', lon);
            drone.flight_path.addPoint(lat, lon);

            // Вычислить расстояние до точки старта
            let distance = -1, // < 0 = no home position
                home_pos_lat = drone.info.get('h_pos_lat'),
                home_pos_lon = drone.info.get('h_pos_lon');

            // Если спутников мало, то расстояние не вычисляем
            if( _this.get('sats') < 5 ){
                distance = 0;
            }
            // Если данных достаточно, то вычисляем дистанцию
            else if( !_.isNil(lat) && !_.isNil(lon) && !_.isNil(home_pos_lat) && !_.isNil(home_pos_lon) && !(home_pos_lat === 0 && home_pos_lon === 0)){
                let from = turf_helpers.point([home_pos_lon, home_pos_lat]);
                let to = turf_helpers.point([lon, lat]);

                distance = Math.round(turf_dist(from, to, {units: 'kilometers'})*1000); // in meters
            }

            // Сохраняем
            _this.set('dist_home', distance);

            // Сбросить точку назначения, если более 2 сек нет данных NAV_CONTROLLER
            if( helpers.now() > dest_point_timeout+2 ) _this.set('dest_point', null);

        };


        // 24 GPS_RAW_INT
        drone.mavlink.on('GPS_RAW_INT', fields => {
            //this.set('gps_fix', fields.fix_type);
            //this.set('alt', Math.round(fields.alt/100)/10);
            //this.set('gps_cog', fields.cog);
            this.set('sats', parseInt(fields.satellites_visible) || 0);

            let gps_speed = Math.round(parseInt(fields.vel)*0.36)/10 || 0;
            gps_speed = gps_speed >= 0 && gps_speed < 10 ? gps_speed.toFixed(1) : gps_speed.toFixed(0);
            this.set('gps_speed', gps_speed); // in KPH!!!  GPS ground speed (m/s * 100). If unknown, set to: UINT16_MAX (Units: cm/s)

            // Если нет сообщений #33 GLOBAL_POSITION_INT, то ставим координаты отсюда. > 2 секунд
            if( helpers.now() > global_pos_last+2 ){
                position_parse(fields.lat/10000000, fields.lon/10000000, Math.round(fields.alt/100)/10);
            }

        });

        // 33 GLOBAL_POSITION_INT
        drone.mavlink.on('GLOBAL_POSITION_INT', fields => {
            /*
                time_boot_ms	uint32_t	ms	Timestamp (time since system boot).
                lat	int32_t	degE7	Latitude, expressed
                lon	int32_t	degE7	Longitude, expressed
                alt	int32_t	mm	Altitude (MSL). Note that virtually all GPS modules provide both WGS84 and MSL.
                relative_alt	int32_t	mm	Altitude above ground
                vx	int16_t	cm/s	Ground X Speed (Latitude, positive north)
                vy	int16_t	cm/s	Ground Y Speed (Longitude, positive east)
                vz	int16_t	cm/s	Ground Z Speed (Altitude, positive down)
                hdg	uint16_t	cdeg	Vehicle heading (yaw angle), 0.0..359.99 degrees. If unknown, set to: UINT16_MAX
             */

            position_parse(fields.lat/10000000, fields.lon/10000000, Math.round(fields.relative_alt/100)/10);

            global_pos_last = helpers.now();

        });

        // 42 MISSION_CURRENT
        drone.mavlink.on('MISSION_CURRENT', fields => {
            // Если поменялась точка назначения при выполнении миссии
            mission_current = parseInt(fields.seq);
        });

        // 62 NAV_CONTROLLER_OUTPUT !!! приходит только в Ardupilot
        drone.mavlink.on('NAV_CONTROLLER_OUTPUT', fields => {
            // Это сообщение передается при автоматическом движении дрона

            // Если дистанция до точки = 0 и точка обозначена и нет блокировки на ее очищение
            // Обнуляем целевую точку
            if( parseInt(fields.wp_dist) <= 2 && !this.block_dest_point_clear ){
                if( this.get('dest_point') ){
                    this.set('dest_point', null);
                    return;
                }
            }
            // Иначе дрон двигается, нужно выяснить куда
            else {

                // ArduRover
                if( 3 === drone.data.autopilot && 'rover' === drone.info.get('ac') && 'custom' === drone.data.modes_type ){
                    // RTL mode (возврат домой)
                    if( this.get('mode') === 11 ){
                        this.set('dest_point', [drone.info.get('h_pos_lat'), drone.info.get('h_pos_lon'), 'h']);
                    }
                    // AUTO mode (движение по точкам миссии)
                    else if( this.get('mode') === 10 && mission_current > 0 ){
                        this.set('dest_point', drone.mission_download.getWP(mission_current));
                    }
                }

                // ArduCopter
                else if( 3 === drone.data.autopilot && 'copter' === drone.info.get('ac') && 'custom' === drone.data.modes_type ){
                    // RTL mode (возврат домой)
                    if( this.get('mode') === 6 ){
                        this.set('dest_point', [drone.info.get('h_pos_lat'), drone.info.get('h_pos_lon'), 'h']);
                    }
                    // AUTO mode (движение по точкам миссии)
                    else if( this.get('mode') === 3 && mission_current > 0 ){
                        this.set('dest_point', drone.mission_download.getWP(mission_current));
                    }
                }

            }

            dest_point_timeout = helpers.now();

        });

        // 87 POSITION_TARGET_GLOBAL_INT !!! приходит только в PX4, аналог 62 в арудпилоте + приходит в дроне Ардупилота
        drone.mavlink.on('POSITION_TARGET_GLOBAL_INT', fields => {
            // Это сообщение приходит в автоматических режимах

            // vx, vy, vz - скорости м/с в локальной системе координат
            // значения становятся null после посадки и перед остановкой этих сообщений
            // Если нет скорости, то нет и точки назначения

            // PX4 Copter
            if( 12 === drone.data.autopilot && 'copter' === drone.info.get('ac') && 'custom' === drone.data.modes_type ){

                if( !fields.vx && !fields.vy && !fields.vz ){
                    if( this.get('dest_point') ) this.set('dest_point', null);

                    return;
                }

                // RTL mode (возврат домой)
                if( this.get('mode') === 84148224 ){
                    this.set('dest_point', [drone.info.get('h_pos_lat'), drone.info.get('h_pos_lon'), 'h']);
                }
                // Mission mode (движение по точкам миссии)
                else if( this.get('mode') === 67371008 ){
                    if( mission_current >= 0 ) this.set('dest_point', drone.mission_download.getWP(mission_current));
                }
                // В любом другом случае берем координаты точки назначения из этого сообщения
                else {
                    // Только если скорость больше 2
                    if( (Math.abs(fields.vx) + Math.abs(fields.vy)) > 2 ){
                        this.set('dest_point', [fields.lat_int/10000000, fields.lon_int/10000000, 'n']);
                    }
                    else {
                        this.set('dest_point', null);
                    }
                }
            }

            dest_point_timeout = helpers.now();

        });

    }

    get(field){
        return _.has(telem1_fi, field) ? this.data[telem1_fi[field]] : undefined;
    }

    set(field, value){
        if( _.has(telem1_fi, field) ) this.data[telem1_fi[field]] = value;

        // Если утсановлена dest_point, то нужно задержать очистку ближайшим NAV_CONTROLLER_OUTPUT
        if( 'dest_point' === field ){
            this.block_dest_point_clear = true;
            setTimeout(() => {this.block_dest_point_clear = false}, 2000);
        }
    }

    // возврат текущих данных для отправки в браузер, вызывается из heartbeat
    getData(){
        return this.data;
    }
}

//
// Контроллер телеметрии 10Гц
class Telem10Controller {
    constructor(drone){
        this.data = _.map(new Array(telem10_fields.length), (n) => {return null});

        // 30 ATTITUDE
        drone.mavlink.on('ATTITUDE', fields => {
            const pi = Math.PI;
            this.set('roll', Math.round(fields.roll * (180/pi))); // Roll angle (rad, -pi..+pi) (Units: rad)
            this.set('pitch', Math.round(fields.pitch * (180/pi)));
            this.set('yaw', Math.round(fields.yaw * (180/pi)));
        });

    }

    get(field){
        return _.has(telem10_fi, field) ? this.data[telem10_fi[field]] : undefined;
    }

    set(field, value){
        if( _.has(telem10_fi, field) ) this.data[telem10_fi[field]] = value;
    }

    // возврат текущих данных для отправки в браузер, вызывается из heartbeat
    getData(){
        return this.data;
    }
}

//
// Контроллер команд
class CommandController {
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
                if( !com_data || !_.has(com_data, 'command') ) return;
                // Выполняем команду
                this.execute(com_data);
            }
        });

        // MAVLink команды
        // 77 COMMAND_ACK Подтверждение исполнения команд
        drone.mavlink.on('COMMAND_ACK', fields => {
            drone.send2io('com_ack', {command: fields.command, result: fields.result})
        });


        //
        //          Установка методов RPC
        //          Эти методы запрашивает rpc_routes для отправки данных в браузер
        //

        // Запуск UDP сервера
        drone.RPC.setMethod('startUDP', (data, response_handler) => {

            const udp_port = parseInt(drone.data.db_params.udp_port) || null;
            if( !udp_port ) return response_handler('UDP port not set');
            if( udp_port < common_config.DRONE_UDP_PORT_MIN || udp_port > common_config.DRONE_UDP_PORT_MAX ) return response_handler('UDP port not allowed');

            systemRPC.req(RK.DRONE_UDP_PROXY_START(), {drone_id: drone.id, port: udp_port })
                .then( result => response_handler(null, result) )
                .catch( response_handler );

        });

        // Остановка UDP сервера
        drone.RPC.setMethod('stopUDP', (data, response_handler) => {

            systemRPC.req(RK.DRONE_UDP_PROXY_STOP(), {drone_id: drone.id})
                .then( result => {
                    drone.info.set({udp_ip_s: 0, udp_ip_c: 'stopped'});
                    response_handler(null, result);
                })
                .catch( response_handler );
        });

        // Запуск TCP сервера
        drone.RPC.setMethod('startGCSTCP', (data, response_handler) => {
            const tcp_port = parseInt(drone.data.db_params.gcs_tcp_port) || null;
            if( !tcp_port ) return response_handler('TCP port not set');
            if( tcp_port < common_config.GCS_TCP_PORT_MIN || tcp_port > common_config.GCS_TCP_PORT_MAX ) return response_handler('TCP port not allowed');

            systemRPC.req(RK.DRONE_GCS_TCP_PROXY_START(), {drone_id: drone.id, port: tcp_port })
                .then( result => response_handler(null, result) )
                .catch(response_handler);
        });

        // Остановка TCP сервера
        drone.RPC.setMethod('stopGCSTCP', (data, response_handler) => {
            systemRPC.req(RK.DRONE_GCS_TCP_PROXY_STOP(), {drone_id: drone.id})
                .then( result => {
                    drone.info.set({tcp_op_s: 0, tcp_op_c: 'stopped'});
                    response_handler(null, result);
                })
                .catch( response_handler );
        });

            // При удалении и остановке дрона
        drone.events.on('destroy', () => {
            drone.redis.Sub.unsubscribe(drone.data_channels.DRONE_UI_COMMANDS);
        });

    }

    execute(data){

        const _this = this;

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

        // Загрузить миссию с борта
        else if( 'get_mission' === data.command ){

            // Функция отправит миссию в браузер
            this.drone.mission_download.start()
                .then( mission_data => {

                    // ПЕРЕНЕСЕНО В ЗАГРУЗКУ МИССИИ С БОРТА
                    // В ArduPilot самый первый элемент - это планируемая точка старта, в миссии не учитывается
                    // В PX4 первый элемент элемент - это и есть первый элемент
                    // если это автопилот ArduPilot, то отправить массив без первого элемента
                    //if( 3 === _this.drone.data.autopilot && mission_data.length > 1 ) mission_data = mission_data.slice(1);

                    this.drone.send2io('com_ack', { command: 1001 ,result: 0 });
                    this.drone.send2io('board_mission', {status:'success', mission_data: mission_data});
                }).catch( err => {
                    this.drone.send2io('com_ack', { command: 1001 ,result: err === 'no_mission' ? 1 : 4 });
                    this.drone.send2io('board_mission', {status:'fail', message: err});
                });
        }

        // Загрузить полетный план на борт
        else if( 'upload_fp' === data.command ){

            const fail_func = function(err){
                _this.drone.send2io('fp_upl_progress', err);
                Logger.error('set_board_mission failed ' + err);
            };

            if( !_.has(data, 'params.fp_id') ) fail_func('no flight plan ID');

            // Вытащить данные миссии и сформировать коллекцию MISSION_ITEM
            FlightPlanModel.get(data.params.fp_id).getJoin({
                    items: {
                        _apply: function(sequence) {
                            return sequence.orderBy('seq')
                        }
                    }
                }).run()
                .then(function(fp){
                    const mission_data = [];
                    let seq = 0;

                    // В Ardupilot первая точка HOME POSITION
                    if( 3 === _this.drone.data.autopilot ){
                        mission_data.push({
                            target_system: _this.drone.mavlink.sysid
                            ,target_component: _this.drone.mavlink.compid
                            ,seq: seq++
                            ,frame: 0
                            ,command: 16
                            ,current: 0
                            ,autocontinue: 1
                            ,param1: 0
                            ,param2: 0
                            ,param3: 0
                            ,param4: 0
                            ,x: fp.home.coordinates[1]
                            ,y: fp.home.coordinates[0]
                            ,z: 0 // FIXME planned home position
                        });
                    }

                    let curr = 1;

                    // Добавляем по очереди все точки
                    for( let i = 0, k = fp.items.length; i < k; i++ ){

                        mission_data.push({
                            target_system: _this.drone.mavlink.sysid
                            ,target_component: _this.drone.mavlink.compid
                            ,current: curr
                            ,autocontinue: 1

                            ,seq: seq++
                            ,frame: fp.items[i].frame
                            ,command: fp.items[i].command
                            ,param1: parseFloat(fp.items[i].param1)
                            ,param2: parseFloat(fp.items[i].param2)
                            ,param3: parseFloat(fp.items[i].param3)
                            ,param4: parseFloat(fp.items[i].param4)
                            ,x: parseFloat(fp.items[i].param5)
                            ,y: parseFloat(fp.items[i].param6)
                            ,z: parseFloat(fp.items[i].param7)
                        });

                        curr = 0;

                    }

                    // Если установлен возврат в точку, добавляем команду
                    if( fp.rtl_end ){
                        // Ardupilot
                        if( 3 === _this.drone.data.autopilot ){
                            mission_data.push({
                                target_system: _this.drone.mavlink.sysid
                                ,target_component: _this.drone.mavlink.compid
                                ,seq: seq++
                                ,frame: 0
                                ,command: 20
                                ,current: 0
                                ,autocontinue: 0
                                ,param1: NaN
                                ,param2: NaN
                                ,param3: NaN
                                ,param4: NaN
                                ,x: NaN
                                ,y: NaN
                                ,z: NaN
                            });
                        }

                        // PX4
                        else if( 12 === _this.drone.data.autopilot ){
                            mission_data.push({
                                target_system: _this.drone.mavlink.sysid
                                ,target_component: _this.drone.mavlink.compid
                                ,seq: seq++
                                ,frame: 2
                                ,command: 20
                                ,current: 0
                                ,autocontinue: 1
                                ,param1: 0
                                ,param2: 0
                                ,param3: 0
                                ,param4: 0
                                ,x: 0
                                ,y: 0
                                ,z: 0
                            });
                        }

                    }

                    // Начинаем загрузку полетного плана на борт
                    _this.drone.mission_upload.start(mission_data)
                        .then(function(){
                            _this.drone.send2io('fp_upl_progress', 100);
                            setTimeout(function(){_this.drone.send2io('fp_upl_progress', 102);}, 500);

                        })
                        .catch( fail_func );

                })
                .catch(function(err){
                    Logger.error(err);
                    fail_func('db error 11');
                });

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
        //     Команды для преобразования в mavlink и отправки на борт
        else {

            //
            // Если дрон оффлайн, то ничего не отправляем
            if( !this.drone.info.get('online') ) {
                this.drone.send2io('com_ack', { command: data.command ,result: 1 }); // Временно отклонен
                return;
            }

            //
            // Установка полетного режима SET_MODE
            if( 'set_mode' === data.command ){
                // на входе data.params.mode
                if( this.drone.data.modes && this.drone.data.modes.hasOwnProperty(data.params.mode) ){

                    this.drone.mavlink.sendMessage('SET_MODE', {
                        target_system: this.drone.mavlink.sysid
                        ,base_mode: this.drone.data.modes[data.params.mode].base
                        ,custom_mode: this.drone.data.modes[data.params.mode].custom
                    });
                    // Подтверждение отловится в обратном сообщении
                }
            }

            // Установка полетного режима Guided у дрона
            else if( 'md_guided' === data.command ) {
                // Arducopter
                if( 'copter' === this.drone.info.get('ac') && 3 === this.drone.data.autopilot ){
                    this.drone.mavlink.sendMessage('SET_MODE', {
                        target_system: this.drone.mavlink.sysid
                        ,base_mode: 81
                        ,custom_mode: 4
                    });
                }

                // TODO PX4 Copter land
                else {

                }

            }

            // Установка полетного режима Loiter у дрона
            else if( 'md_loiter' === data.command ) {
                // Arducopter
                if( 'copter' === this.drone.info.get('ac') && 3 === this.drone.data.autopilot ){
                    this.drone.mavlink.sendMessage('SET_MODE', {
                        target_system: this.drone.mavlink.sysid
                        ,base_mode: 89
                        ,custom_mode: 5
                    });
                }

                // TODO PX4 Copter land
                else {

                }

            }

            // Отправка команды Loiter Unlimited
            else if( 'cm_loiter' === data.command ) {
                // Arducopter
                if( 'copter' === this.drone.info.get('ac') && 3 === this.drone.data.autopilot ){
                    this.drone.mavlink.sendMessage('COMMAND_LONG', {
                        target_system: this.drone.mavlink.sysid
                        ,target_component: this.drone.mavlink.compid
                        ,command: 17 // MAV_CMD -> MAV_CMD_NAV_LOITER_UNLIM
                        ,confirmation: 0
                        ,param1: null
                        ,param2: null
                        ,param3: null
                        ,param4: 0
                        ,param5: null
                        ,param6: null
                        ,param7: 10
                    });
                }

                // TODO PX4 Copter land
                else {

                }

            }

            // ARM / DISARM
            else if( 'arm' === data.command ){
                this.drone.mavlink.sendMessage('COMMAND_LONG', {
                    target_system: this.drone.mavlink.sysid
                    ,target_component: this.drone.mavlink.compid
                    ,command: 400 // MAV_CMD -> MAV_CMD_COMPONENT_ARM_DISARM
                    ,confirmation: 0
                    ,param1: data.params.arm ? 1 : 0
                    ,param2: null
                    ,param3: null
                    ,param4: null
                    ,param5: null
                    ,param6: null
                    ,param7: null
                });
            }

            // Команда Взлет
            else if( 'takeoff' === data.command ){

                this.drone.mavlink.sendMessage('COMMAND_LONG', {
                    target_system: this.drone.mavlink.sysid
                    ,target_component: this.drone.mavlink.compid
                    ,command: 22 // MAV_CMD -> MAV_CMD_NAV_TAKEOFF
                    ,confirmation: 0
                    ,param1: 0
                    ,param2: ''
                    ,param3: ''
                    ,param4: 0
                    ,param5: ''
                    ,param6: ''
                    ,param7: data.params.alt
                });
            }

            // Полет на точку
            else if( 'nav2p' === data.command ) {
                // ArduRover in Guided mode
                if( 3 === this.drone.data.autopilot && 'rover' === this.drone.info.get('ac') && 'custom' === this.drone.data.modes_type && this.drone.telem1.get('mode') === 15 ){

                    this.drone.mavlink.sendMessage('MISSION_ITEM', {
                        target_system: this.drone.mavlink.sysid
                        ,target_component: this.drone.mavlink.compid
                        ,seq: 0
                        ,frame: 3
                        ,command: 16
                        ,current: 1 // было 2 ?
                        ,autocontinue: 1
                        ,param1: 0
                        ,param2: 0
                        ,param3: 0
                        ,param4: 0
                        ,x: data.params.lat
                        ,y: data.params.lng
                        ,z: 0
                        ,mission_type: 8
                    });

                    this.drone.telem1.set('dest_point', [data.params.lat, data.params.lng, 'n']);

                }

                // ArduCopter in Guided mode
                else if( 3 === this.drone.data.autopilot && 'copter' === this.drone.info.get('ac') && 'custom' === this.drone.data.modes_type && this.drone.telem1.get('mode') === 4 ){

                    this.drone.mavlink.sendMessage('MISSION_ITEM', {
                        target_system: this.drone.mavlink.sysid
                        ,target_component: this.drone.mavlink.compid
                        ,seq: 0
                        ,frame: 3
                        ,command: 16
                        ,current: 2 // было 2 ?
                        ,autocontinue: 1
                        ,param1: 0
                        ,param2: 0
                        ,param3: 0
                        ,param4: 0
                        ,x: data.params.lat
                        ,y: data.params.lng
                        ,z: this.drone.telem1.get('alt')
                        ,mission_type: 8
                    });

                    this.drone.telem1.set('dest_point', [data.params.lat, data.params.lng, 'n']);

                }

                // PX4 Copter in any mode
                else if( 12 === this.drone.data.autopilot && 'copter' === this.drone.info.get('ac') ){
                    // 75 COMMAND_INT: {"target_system":1,"target_component":1,"frame":0,"command":192,"current":0,"autocontinue":0,"param1":-1,"param2":1,"param3":0,"param4":null,"x":557526702,"y":376231237,"z":69.802001953125}

                    this.drone.mavlink.sendMessage('COMMAND_INT', {
                        target_system: this.drone.mavlink.sysid
                        ,target_component: this.drone.mavlink.compid
                        ,frame: 0
                        ,command: 192
                        ,current: 0
                        ,autocontinue: 0
                        ,param1: -1
                        ,param2: 1
                        ,param3: 0
                        ,param4: NaN
                        ,x: data.params.lat*10000000
                        ,y: data.params.lng*10000000
                        ,z: _this.drone.telem1.get('alt') > 1 ? _this.drone.telem1.get('alt') : 10
                    });

                    this.drone.telem1.set('dest_point', [data.params.lat, data.params.lng, 'n']);

                }

            }

            // Команда Посадка
            else if( 'land' === data.command ) {
                // Arducopter
                if( 'copter' === this.drone.info.get('ac') && 3 === this.drone.data.autopilot && this.drone.telem1.get('armed') ){
                    this.drone.mavlink.sendMessage('SET_MODE', {
                        target_system: this.drone.mavlink.sysid
                        ,base_mode: 217
                        ,custom_mode: 9
                    });
                }

                // TODO PX4 Copter land
                else {

                }

            }

            // Команда RTL
            else if( 'rtl' === data.command ) {
                // Arducopter
                if( 'copter' === this.drone.info.get('ac') && 3 === this.drone.data.autopilot && this.drone.telem1.get('armed') ){
                    this.drone.mavlink.sendMessage('SET_MODE', {
                        target_system: this.drone.mavlink.sysid
                        ,base_mode: 217
                        ,custom_mode: 6
                    });
                }

                // TODO PX4 Copter land
                else {

                }
            }

            // Управление реле
            else if( 'switch_relay' === data.command ) {

                // строка не выдаст ошибку, а только таймаут команды
                if( !data.params.relay || !data.params.switch ) return;

                this.drone.mavlink.sendMessage('COMMAND_LONG', {
                    target_system: this.drone.mavlink.sysid
                    ,target_component: this.drone.mavlink.compid
                    ,command: 181 // MAV_CMD -> MAV_CMD_DO_SET_RELAY
                    ,confirmation: 0
                    ,param1: parseInt(data.params.relay)
                    ,param2: data.params.switch === 'on' ? 1 : 0
                    ,param3: null
                    ,param4: null
                    ,param5: null
                    ,param6: null
                    ,param7: null
                });

            }

            // Управление серво
            else if( 'set_servo' === data.command ) {
                if( !data.params.hasOwnProperty('servo') || parseInt(data.params.servo) < 5 ) return;

                let value = 0;
                if( data.params.hasOwnProperty('sw') ){
                    if( parseInt(data.params.sw) ) value = 2000;
                    else value = 1000;
                }
                else if( data.params.hasOwnProperty('value') ){
                    value = 1000 + 50*parseInt(data.params.value);
                    if( value > 2000 ) value = 2000;
                    if( value < 1000 ) value = 1000;
                }

                if( !value ) return;

                this.drone.mavlink.sendMessage('COMMAND_LONG', {
                    target_system: this.drone.mavlink.sysid
                    ,target_component: this.drone.mavlink.compid
                    ,command: 183 // MAV_CMD -> MAV_CMD_DO_SET_SERVO
                    ,confirmation: 0
                    ,param1: parseInt(data.params.servo)
                    ,param2: value
                    ,param3: null
                    ,param4: null
                    ,param5: null
                    ,param6: null
                    ,param7: null
                });

            }

        }

    }

}

//
// Контроллер джойстика
class JoystickController {
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

        if( !this.drone.telem1.get('armed') ) return;

        //
        // Arducopter
        if( 'copter' === this.drone.info.get('ac') && 3 === this.drone.data.autopilot ){

            // in guided mode
            if( this.drone.telem1.get('mode') === 4 || this.drone.telem1.get('mode') === 20 ){

                // Если в текущих и предыдущих данных 00, то тоже ничего не отправляем
                if( 0 === this.last_sent_pos_data.jlx && 0 === this.last_sent_pos_data.jly && 0 === this.last_sent_pos_data.jrx && 0 === this.last_sent_pos_data.jry && 0 === this.pos_data.jlx && 0 === this.pos_data.jly && 0 === this.pos_data.jrx && 0 === this.pos_data.jry ) return;

                // Сохранить для сравнения со следующими данными
                this.last_sent_pos_data.jlx = this.pos_data.jlx;
                this.last_sent_pos_data.jly = this.pos_data.jly;
                this.last_sent_pos_data.jrx = this.pos_data.jrx;
                this.last_sent_pos_data.jry = this.pos_data.jry;

                // Подготовить значения для отправки
                let vx = parseInt(this.pos_data.jry)/10 || 0, // max 50/10 = 5 m/s
                    vy = parseInt(this.pos_data.jrx)/10 || 0, // max 50/10 = 5 m/s
                    vz = parseInt(this.pos_data.jly)/10*-1 || 0, // max 50/10 = 5 m/s // Z velocity in m/s (positive is down)
                    yr = Math.round(parseInt(this.pos_data.jlx)/5)/10 || 0; // 1 rad/sec


                let fields = {
                    time_boot_ms: helpers.now_ms()
                    ,target: this.drone.mavlink.sysid
                    ,target_component: this.drone.mavlink.compid
                    ,coordinate_frame: 9
                    ,type_mask: 1479
                    ,x: null
                    ,y: null
                    ,z: null
                    ,vx: vx
                    ,vy: vy
                    ,vz: vz // Z velocity in m/s (positive is down)
                    ,afx: null
                    ,afy: null
                    ,afz: null
                    ,yaw: null
                    ,yaw_rate: yr
                };
                // Отправить сообщение SET_POSITION_TARGET_LOCAL_NED
                this.drone.mavlink.sendMessage('SET_POSITION_TARGET_LOCAL_NED', fields);

                //console.log("JOY TEST", JSON.stringify(fields));
            }

            // other modes
            else {

                // RC_CHANNELS_OVERRIDE
                const control_rate = 0.7;

                // установить каналы из параметров

                let rc_chan = {
                     1: 65535
                    ,2: 65535
                    ,3: 65535
                    ,4: 65535
                    ,5: 65535
                    ,6: 65535
                    ,7: 65535
                    ,8: 65535
                    ,9: 65535
                    ,10: 65535
                    ,11: 65535
                    ,12: 65535
                    ,13: 65535
                    ,14: 65535
                    ,15: 65535
                    ,16: 65535
                    ,17: 65535
                    ,18: 65535
                };

                let rc_roll = this.drone.params.get('RCMAP_ROLL');
                if( rc_roll && rc_roll > 0 && rc_roll <= 18 ) rc_chan[rc_roll] = 1500+Math.round(this.pos_data.jrx*10*control_rate);

                let rc_pitch = this.drone.params.get('RCMAP_PITCH');
                if( rc_pitch && rc_pitch > 0 && rc_pitch <= 18 ) rc_chan[rc_pitch] = 1500+Math.round(this.pos_data.jry*10*control_rate)*-1;

                let rc_throt = this.drone.params.get('RCMAP_THROTTLE');
                if( rc_throt && rc_throt > 0 && rc_throt <= 18 ) rc_chan[rc_throt] = 1500+Math.round(this.pos_data.jly*10*control_rate);

                let rc_yaw = this.drone.params.get('RCMAP_YAW');
                if( rc_yaw && rc_yaw > 0 && rc_yaw <= 18 ) rc_chan[rc_yaw] = 1500+Math.round(this.pos_data.jlx*10*control_rate);

                // Отправляем RC_OVERRIDE
                this.drone.mavlink.sendMessage('RC_CHANNELS_OVERRIDE', {
                     target_system: this.drone.mavlink.sysid
                    ,target_component: this.drone.mavlink.compid
                    ,chan1_raw: rc_chan[1]
                    ,chan2_raw: rc_chan[2]
                    ,chan3_raw: rc_chan[3]
                    ,chan4_raw: rc_chan[4]
                    ,chan5_raw: rc_chan[5]
                    ,chan6_raw: rc_chan[6]
                    ,chan7_raw: rc_chan[7]
                    ,chan8_raw: rc_chan[8]
                    ,chan9_raw: rc_chan[9]
                    ,chan10_raw: rc_chan[10]
                    ,chan11_raw: rc_chan[11]
                    ,chan12_raw: rc_chan[12]
                    ,chan13_raw: rc_chan[13]
                    ,chan14_raw: rc_chan[14]
                    ,chan15_raw: rc_chan[15]
                    ,chan16_raw: rc_chan[16]
                    ,chan17_raw: rc_chan[17]
                    ,chan18_raw: rc_chan[18]
                });
            }

        }

        //
        // Все автопилоты
        else {
            this.drone.mavlink.sendMessage('MANUAL_CONTROL', {
                target: this.drone.mavlink.sysid
                ,target_component: this.drone.mavlink.compid
                ,x: Math.round(this.pos_data.jry*20) || 0
                ,y: Math.round(this.pos_data.jrx*20) || 0
                ,z: Math.round(this.pos_data.jly*20) || 0
                ,r: Math.round(this.pos_data.jlx*20) || 0
                ,buttons: 0
            });
        }

    }

}

//
// Контроллер сохранения пути
class FlightPathController {

    constructor(drone){
        this.drone = drone;
        this.path = []; // array of [lng,lat]

        // Очистить след если дрон дезактивирован
        drone.events.on('disarmed', () => { this.clear() });

        // Очистить след, если дрон был оффлайн более 60 минут
        drone.events.on('isOnline', downtime => {  if( downtime > 3600 ) this.clear() });

    }

    addPoint(lat, lng){
        // Если дрон дезактивирован, то ничего не делаем
        if( !parseInt(this.drone.telem1.get('armed')) ) return;

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

//
// Контроллер загрузки лог файлов
class LogDownloadController {
    constructor(drone){
        this.drone = drone;

        this.logs_list = [];
        this.log_size_by_id = {};
        this.log_ts_by_id = {};

        this.block_size = 46080; // == 512 кусков по 90 байт

        this.current_dl_log_num = 0;
        this.current_dl_log_size = 0;
        this.current_dl_log_ts = 0;
        this.log_buffer = '';
        this.download_in_progress = false;
        this.parsing_in_progress = false;
        this.current_offset = 0;
        this.next_block_from_offset = 0;
        this.max_req_num = 0;
        this.reqs = 0;
        this.download_queue = [];

        const _this = this;

        let process_timeout = null;
        let current_speed = 0; // Bytes/sec
        let bytes_counter = 0;
        let time_remaining = 0;
        let last_speed_point = 0;

        this.report_process = (data) => {
            drone.send2io('report_log_dl', data);
        };

        this.event_handlers = function(){

            let handlers = {};

            return {
                set: function(event, timeout, resolve, reject) {
                    if( !_.has(handlers, event) ) handlers[event] = {};

                    let h_uid = nodeUuid.v4().substr(0, 10);
                    handlers[event][h_uid] = {resolve: resolve, reject: reject};

                    handlers[event][h_uid].timeout = setTimeout(function(){
                        handlers[event][h_uid]['reject']('timeout');
                        _.unset(handlers[event], h_uid);
                    }, timeout);
                }
                ,call: function(event, data){
                    if( !_.has(handlers, event) ) return;

                    _.mapKeys(handlers[event], function(rec, uuid){
                        clearTimeout(rec.timeout);
                        rec.resolve(data);
                        _.unset(handlers[event], uuid);
                    });
                }
            }
        }();

        // Эта функция запускается, если нет сообщений с данными лога больше 500мс
        // Запускает запрос следующего блока или прекращает загрузку
        const process_timeout_callback = () => {
            if( !this.download_in_progress ) return;

            console.log('LOG process timeout', this.current_offset);
            // Если перестали приходить сообщения LOG_DATA

            // Если таймаут срабатывал больше допустимого кол-ва раз
            if( this.reqs >= this.max_req_num ){
                Logger.error('Max Req reached. Downloaded', this.log_buffer.length, 'of', this.current_dl_log_size);
                this.report_process({status: 'failed', id: this.current_dl_log_num, msg: 'Failed to download log file'});
                this.cancel_process();
                return;
            }

            // Если дрон не онлайн
            if( !drone.info.isOnline() ){
                this.cancel_process();
                Logger.error('Drone gone offline', this.log_buffer.length, 'of', this.current_dl_log_size);
                this.report_process({status: 'failed', id: _this.current_dl_log_num, msg: 'Failed: Drone gone offline'});
                return;
            }

            this.reqs++;

            this.request_next_block();
            this.set_process_timeout();
        };

        this.request_next_block = () => {
            this.drone.mavlink.sendMessage('LOG_REQUEST_DATA', {
                target_system: this.drone.mavlink.sysid
                ,target_component: this.drone.mavlink.compid
                ,id: this.current_dl_log_num
                ,ofs: this.current_offset
                ,count: this.block_size
            });
            progress_check();

            console.log('Req', this.current_offset, 'of', this.current_dl_log_size);
        };
        this.set_process_timeout = () => {
            if( process_timeout ) clearTimeout(process_timeout);
            process_timeout = setTimeout(() => {
                process_timeout_callback();
            }, 500);
        };
        this.cancel_process = () => {
            if( process_timeout ) clearTimeout(process_timeout);
            this.download_in_progress = false;
            this.parsing_in_progress = false;
            this.log_buffer = '';
            this.current_offset = 0;
            this.current_dl_log_num = 0;

            this.drone.mavlink.sendMessage('LOG_REQUEST_END', {
                target_system: this.drone.mavlink.sysid
                ,target_component: this.drone.mavlink.compid
            });

            setTimeout(() => {
                if( drone.info.isOnline() ) this.download_next();
            }, 2000);
        };

        this.download_complete = () => {
            if( process_timeout ) clearTimeout(process_timeout);
            this.parsing_in_progress = true;
            this.download_in_progress = false;

            if( !this.log_buffer.length ){
                Logger.error('Empty log file buffer');
                this.report_process({status: 'failed', id: _this.current_dl_log_num, msg: 'Failed to receive data'});
                this.cancel_process();
                return;
            }

            Logger.info('Log download complete', this.log_buffer.length, 'of', this.current_dl_log_size);
            this.report_process({status: 'pars', id: _this.current_dl_log_num, msg: 'Download complete. Parsing...'});

            // Придумать имя файла
            let file_name = helpers.now() + '_' + nodeUuid.v4().substr(0, 10) + '.bin';

            // Записать в файл
            fs.writeFile('./../logs/' + file_name, this.log_buffer, 'binary', err => {
                // Если ошибка
                if( err ){
                    this.report_process({status: 'failed', id: _this.current_dl_log_num, msg: 'Failed to save file'});
                    this.cancel_process();
                    Logger.error('Failed to write file');
                    return;
                }

                // Попробовать распарсить файл
                try {

                    const spawn = require("child_process").spawn;

                    const pyprocess = spawn('python',["./../utils/pymavlink/DFReader.py", './../logs/' + file_name] );

                    let parse_response = '';
                    pyprocess.stdout.on('error', () => {
                        throw Error('pyprocess error');
                    } );
                    pyprocess.stdout.on('data', (data)=> {
                        parse_response += data;
                    } );
                    pyprocess.stdout.on('close', function() {
                        if( !parse_response.includes('OK') ){
                            _this.report_process({status: 'failed', id: _this.current_dl_log_num, msg: 'Failed to parse file'});
                            _this.cancel_process();
                            Logger.error('Failed to parse file');
                            return;
                        }

                        Logger.info('JSON file saved');

                        DataFlashLog.grab_data(file_name)
                            .then( grab_result => {

                                try {

                                    let new_log_data = {
                                         bin_file: file_name
                                        ,drone_id: _this.drone.id
                                        ,ind_ts_sz: _this.current_dl_log_num + '_' + _this.current_dl_log_ts + '_' + _this.current_dl_log_size
                                        ,gps_time: DataFlashLogModel.r().epochTime(grab_result.gps_time)
                                        ,l_time: grab_result.l_time
                                    };

                                    if( grab_result.lat !== null && grab_result.lon !== null ){
                                        new_log_data.location_point = DataFlashLogModel.r().point(parseFloat(grab_result.lon), parseFloat(grab_result.lat));
                                        new_log_data.location = grab_result.lat + '  ' + grab_result.lon;
                                    }

                                    // Завести запись в БД
                                    const new_log = new DataFlashLogModel(new_log_data);

                                    // Validate data
                                    new_log.validate();

                                    // Save new log
                                    new_log.save()
                                        .then( doc => {
                                            _this.report_process({status: 'success', id: _this.current_dl_log_num, msg: 'Log file uploaded and parsed', log_id: doc.id});
                                            _this.cancel_process();
                                            //Logger.info('new log saved ', doc);

                                            try {
                                                // Location lookup
                                                if( grab_result.lat !== null && grab_result.lon !== null ){
                                                    DataFlashLog.location_lookup(grab_result.lat, grab_result.lon)
                                                        .then(function(response){
                                                            //console.log('LOC', result);
                                                            if( 'OK' === response.json.status ){
                                                                //console.log(response.json.results[0].formatted_address);
                                                                new_log.location = response.json.results[0].formatted_address;
                                                                new_log.save();
                                                            }
                                                        })
                                                        .catch((err) => {
                                                            console.log('ERR', err);
                                                        });
                                                }
                                            }
                                            catch (e){
                                                console.log('Lookup err', e);
                                            }

                                        })
                                        .catch( e => {
                                            _this.report_process({status: 'failed', id: _this.current_dl_log_num, msg: 'Failed to save to DB (0)'});
                                            _this.cancel_process();
                                            Logger.error(e);
                                        });

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
                                _this.report_process({status: 'failed', id: _this.current_dl_log_num, msg: 'Failed to read log file'});
                                _this.cancel_process();
                                Logger.error(e);
                            });


                    });

                }
                catch (e) {
                    _this.report_process({status: 'failed', id: _this.current_dl_log_num, msg: 'Failed to parse file'});
                    _this.cancel_process();
                    Logger.error('Failed to process file', e);
                }

            });

        };

        const progress_check = (count=0) => {
            bytes_counter += count;

            // посчитать скорость и оставшееся время
            let period = helpers.now_ms()-last_speed_point;
            if( period >= 1000 ){
                current_speed = Math.round(bytes_counter/(period/1000));
                time_remaining = Math.round((this.current_dl_log_size-this.current_offset)/current_speed);
                let progress_percent = Math.round((this.current_offset/this.current_dl_log_size)*100);


                last_speed_point = helpers.now_ms();
                bytes_counter = 0;

                _this.report_process({
                    status: 'pend'
                    ,id: _this.current_dl_log_num
                    ,c: {
                         p: progress_percent
                        ,s: helpers.readable_bytes(this.current_dl_log_size)
                        ,sp: helpers.readable_bytes(current_speed)
                        ,tr: helpers.readable_seconds(time_remaining)
                    }
                });
            }
        };

        // Автозагрузка последнего лог файла после дизарма
        drone.events.on('disarmed', () => { this.auto_download() });

        // Обнулить очередь, если дрон ушел в оффлайн
        drone.events.on('isOffline', uptime => {
            if( this.download_in_progress ){
                _this.report_process({status: 'failed', id: _this.current_dl_log_num, msg: 'Drone gone offline'});
                _this.cancel_process();
            }
            this.download_queue = [];
        });

        // Прочитать список логфайлов
        drone.mavlink.on('LOG_ENTRY', fields => {
            if( !parseInt(fields.num_logs) ){
                this.logs_list = [];
                this.event_handlers.call('listLoad', this.logs_list);
                return;
            }

            this.logs_list.push({ id: fields.id ,ts: fields.time_utc ,sz: fields.size });
            this.log_size_by_id[fields.id] = fields.size;
            this.log_ts_by_id[fields.id] = fields.time_utc;

            if( parseInt(fields.last_log_num) === parseInt(fields.id) )  this.event_handlers.call('listLoad', this.logs_list);
        });

        // Получение данных логфайла
        drone.mavlink.on('LOG_DATA', fields => {
            // Если не в процессе скачивания или id лога не то, что нужно, то ничего не делать
            if( !this.download_in_progress || parseInt(fields.id) !== this.current_dl_log_num ) return;

            // Длина данных
            let count = parseInt(fields.count);

            // Если пришел ожидаемый кусок
            if( parseInt(fields.ofs) === this.current_offset ){
                // Если есть длина данных
                if( count > 0 ){
                    let chunk = fields.data;
                    // Если кусок меньше стандартного 90 байт, то обрезать лишнее
                    if( count < 90 && chunk.length > count ) chunk = chunk.slice(0, count);

                    // приклеить к буферу
                    this.log_buffer += chunk;
                    // увеличить смещение
                    this.current_offset += count;

                    progress_check(count);

                }

                // Если кусок < 90 байт, то он последний
                if( count < 90 ){
                    this.download_complete();
                }
                // А если == 90, то ждем следующее сообщение или запрашиваем следующий блок
                else {
                    if( this.current_offset === this.next_block_from_offset ) {
                        this.next_block_from_offset = this.current_offset + this.block_size;
                        this.request_next_block();
                    }
                }
            }

            // сбросить таймаут процесса
            this.set_process_timeout();

        });

        // Удаление логов на борту
        drone.RPC.setMethod('eraseBoardLogs', (data, response_handler) => {
            if( !drone.info.isOnline() ) response_handler('Drone offline');

            _this.drone.mavlink.sendMessage('LOG_ERASE', {
                target_system: _this.drone.mavlink.sysid
                ,target_component: _this.drone.mavlink.compid
            });
            response_handler(null, 'OK');
        });

        // Загрузить и отправить список лог файлов на борту
        drone.RPC.setMethod('getBoardLogs', (data, response_handler) => {
            this.get_list()
                .then( list => {

                    // Сделать список подписей логов
                    let logs_check_list = [];
                    _.each(list, rec => { logs_check_list.push(rec.id + '_' + rec.ts + '_' + rec.sz) });

                    // Найти в БД логи
                    DataFlashLogModel.getAll(DataFlashLogModel.r().args(logs_check_list), {index: 'ind_ts_sz'}).run()
                        .then( result => {
                            let ready_list = [];
                            let downloaded_list = {};
                            if( result.length ) _.each(result, rec => { downloaded_list[rec.ind_ts_sz] = rec.id });

                            _.each(list, item => {

                                let ind_ts_sz = item.id + '_' + item.ts + '_' + item.sz;

                                // Если этот лог загружается в данный момент
                                if( _this.download_in_progress && _this.current_dl_log_num === item.id ){
                                    item.s = 'dl';
                                    item.dp = Math.round(_this.current_offset/_this.current_dl_log_size*100);
                                }
                                else if( _.includes(_this.download_queue, item.id) ){
                                    item.s = 'q';
                                }
                                else if( _.has(downloaded_list, ind_ts_sz) ){
                                    item.s = 'v';
                                    item.log_id = downloaded_list[ind_ts_sz];
                                }
                                else {
                                    item.s = 0;
                                }

                                item.sz = helpers.readable_bytes(item.sz);

                                ready_list.push(item);
                            });

                            response_handler(null, ready_list);
                        })
                        .catch( err => {
                            console.log('DB error', err);
                            response_handler('DB error');
                        });

                })
                .catch( err => {
                    response_handler('Err 1');
                    Logger.error('Failed to load logs list', err);
                });
        });

        // Запрос загрузки лог файла по id
        drone.RPC.setMethod('downloadBoardLog', (log_id, response_handler) => {
            // Если в данный момент идет загрузка лога, то текущий номер помещается в очередь
            if( this.download_in_progress || this.parsing_in_progress ){
                this.download_queue.push(log_id);
                response_handler(null, 'queued');
            }
            else {
                if( this.download(log_id) ) response_handler(null, 'started');
                else response_handler('Failed to start');
            }
        });

        // Остановка загрузки по id
        drone.RPC.setMethod('logDLCancel', (log_id, response_handler) => {
            this.stop(log_id);
            response_handler(null, 'OK');
        });

        // Удаление лога из списка ожидания
        drone.RPC.setMethod('logDLCancelQ', (log_id, response_handler) => {
            this.download_queue = _.filter(this.download_queue, function(i){return i !== log_id});
            response_handler(null, 'OK');
        });

    }

    // Запросить список логфайлов на борту
    get_list(){
        const _this = this;

        this.logs_list = [];
        this.log_size_by_id = {};
        this.log_ts_by_id = {};

        return new Promise(function(resolve, reject){
            _this.event_handlers.set('listLoad', 5000, resolve, reject);

            _this.drone.mavlink.sendMessage('LOG_REQUEST_LIST', {
                target_system: _this.drone.mavlink.sysid
                ,target_component: _this.drone.mavlink.compid
                ,start: 0
                ,end: 0xffff
            });
        });

    }

    // Запустить скачку лога по id
    download(log_id){
        // Запросить скачивание логфайла
        Logger.info('DOWNLOAD log ' + log_id);

        this.current_dl_log_num = log_id;
        this.current_dl_log_size = this.log_size_by_id[log_id];
        this.current_dl_log_ts = this.log_ts_by_id[log_id];

        if( !this.current_dl_log_num || !this.current_dl_log_size || this.current_dl_log_size <= 0 ) return false;

        this.download_in_progress = true;
        this.log_buffer = '';
        this.current_offset = 0;
        this.next_block_from_offset = this.current_offset + this.block_size;
        this.reqs = 1;
        this.max_req_num = Math.round(this.current_dl_log_size/this.block_size)+2;

        this.request_next_block();
        this.set_process_timeout();

        return true;
    }

    // Загрузка следующего файла из списка
    download_next(){
        if( this.download_in_progress || this.parsing_in_progress || !this.download_queue.length ) return;

        let next_log = this.download_queue.shift();
        this.download(next_log);

    }

    // Запуск автозагрузки
    auto_download(){
        // Если выключен параметр сохранения лога в файл после дизарма, то ничего не делать
        if( this.drone.params.get('LOG_FILE_DSRMROT') !== 1 || this.drone.data.db_params.dl_log_on_disarm !== 1 ) return;

        // Запросить список логов, если есть что-то, то определить последний и загрузить в download()
        this.get_list()
            .then( list => {
                if( !list.length ) return;
                this.download(list[list.length-1].id);
            })
            .catch( err => {
                Logger.info('Auto download of logs failed (may be no logs)');
            });
    }

    // Остановка загрузки
    stop(log_id=0){
        if( this.download_in_progress && ( this.current_dl_log_num === log_id || 0 === log_id )){
            this.report_process({status: 'stopped', id: this.current_dl_log_num, msg: 'Downloading stopped'});
            this.cancel_process();
        }
        return true;
    }

}

//
// Контроллер параметров
class ParamsController {

    constructor(drone){
        this.drone = drone;
        this.params = {};
        this.params_by_index = {};
        this.params_count = 0;
        this.missing_params = [];

        // Через 2 сек после прихода такого сообщения проверяем полноту параметров
        this.check_timeout = null;

        // Проверка на полный список параметров
        this.check_params = () => {
            this.missing_params = [];
            for( let i = 0, k = this.params_count; i < k; i++ ){
                if( !_.has(this.params_by_index, i.toString()) ) this.missing_params.push(i);
            }

            if( !this.missing_params.length ) return;

            try {
                this.missing_params.each( param_ind => {
                    // Запросить пропущенные параметры
                    this.drone.mavlink.sendMessage('PARAM_REQUEST_READ', {
                        target_system: this.drone.mavlink.sysid
                        ,target_component: this.drone.mavlink.compid
                        ,param_id: ''
                        ,param_index: parseInt(param_ind)
                    });
                });
            }
            catch(e){
                console.log(this.missing_params);
            }


        };

        // Загрузить параметры в первый раз, если дрон онлайн
        drone.events.once('infoLoaded', info => {
            if( drone.info.isOnline() ) this.request_params();
        });

        // Прочитать и загрузить параметры
        drone.mavlink.on('PARAM_VALUE', fields => {

            let param_count = parseInt(fields.param_count)
                ,param_index = parseInt(fields.param_index)
                ,param_id = fields.param_id.replace(/\0/g, '').trim()
                ,param_type = parseInt(fields.param_type);
            let param_value = (param_type > 8 ? parseFloat(fields.param_value) : parseInt(fields.param_value));

            // Индекс больше счетчика, значит это подтверждение параметра
            if( param_index > param_count && _.has(this.params, param_id) ){
                this.params[param_id].value = param_value;
                return;
            }

            if( this.check_timeout ) clearTimeout(this.check_timeout);

            this.params[param_id] = { type: param_type, value: param_value };
            this.params_by_index[param_index.toString()] = param_id;

            if( !this.params_count || this.params_count !== param_count ) this.params_count = param_count;

            // Через 2 секунды проверить все ли параметры пришли
            this.check_timeout = setTimeout( () => {
                this.check_params();
            }, 2000);

        });

        // Загрузить снова все параметры если дрон был оффлайн больше 30 сек
        drone.events.on('isOnline', downtime => {
            if( downtime > 30 )
                this.request_params();
        });

        // Запрос списка параметров
        drone.RPC.setMethod('getBoardParams', (data, response_handler) => {

            if( !this.params_count ){
                return response_handler("Parameters are not loaded yet");
            }

            let params_list = [];
            _.mapKeys(this.params, (p_data, id) => {
                params_list.push({id: id, val: p_data.value, tp: p_data.type});
            });

            response_handler(null, params_list);
        });

        // Сохранение параметров
        drone.RPC.setMethod('saveBoardParams', (data, response_handler) => {

            if( !this.drone.info.isOnline() ) return response_handler('Drone gone offline');

            if( !_.isArray(data) || !data.length ) return response_handler('Empty list');

            _.each(data, param => {
                this.set(param.id, param.val);
            });

            response_handler(null, 'OK');

        });

    }

    request_params(){

        this.missing_params = [];

        // Запросить лист
        this.drone.mavlink.sendMessage('PARAM_REQUEST_LIST', {
             target_system: this.drone.mavlink.sysid
            ,target_component: this.drone.mavlink.compid
        });
    }

    get(param_id){
        return _.has(this.params, param_id) ? this.params[param_id].value : null;
    }

    set(param_id, param_value){
        console.log('Param set', param_id, param_value);

        if( !_.has(this.params, param_id) ) return;

        param_value = (this.params[param_id].type > 8 ? parseFloat(param_value) : parseInt(param_value));

        this.drone.mavlink.sendMessage('PARAM_SET', {
            target_system: this.drone.mavlink.sysid
            ,target_component: this.drone.mavlink.compid
            ,param_id: param_id.length < 16 ? param_id + "\0" : param_id
            ,param_value: param_value
            ,param_type: this.params[param_id].type
        });

    }

}


/* объект Drone

Принимает mavlink сообщения
    сохраняет текущую информацию в память
    отправляет информацию и телеметрию в браузер

Принимает команды из браузера
    отправляет информацию по запросу
    перенаправляет их в дрон

статус онлайн this.drone_data.info.get('online') = (0 или 1)

 */
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

        try {

            let start_time = helpers.now_ms();

            const _this = this;

            this.redis = {
                Sub: redisClient.duplicate()
                , Pub: redisClient.duplicate()
                , SubBuf: redisClientBuf.duplicate()
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

            this.data_channels = {
                // Переменные и каналы redis и IO
                 MAVLINK_FROM_DRONE: RK.MAVLINK_FROM_DRONE(params.id) // MAVLink с борта
                , MAVLINK_TO_DRONE: RK.MAVLINK_TO_DRONE(params.id) // MAVLink на борт
                , DRONE_UI_COMMANDS: RK.DRONE_UI_COMMANDS(params.id) // Канал с командами из браузера
                , DRONE_INFO_CHANNEL: RK.DRONE_INFO_CHANNEL(params.id) // Канал с информацией
                , DRONE_INFO_KEY: RK.DRONE_INFO_KEY(params.id) // Переменая с информацией о дроне
                , DRONE_IO_ROOM: IK.DRONE_IO_ROOM(params.id) // Канал в io для исходящей телеметрии дрона
            };

            this.id = params.id;
            this.data = {
                // Тип автопилота
                autopilot: null // 3=Ardupilot, 12=PX4
                // Тип рамы
                , type: null
                // список полетных режимов
                , modes: null
                // по какому типу определять режим base или custom
                , modes_type: null
                , db_params: params // Параметры из БД
                // Счетчики сообщений
                , message_counters: {
                    total: 0
                    , decoded: 0
                    , missed: 0
                    , errors: 0
                    , create_errors: 0
                }
            };

            // Инициализация MAVLink
            this.mavlink = new MAVLinkController(this);

            // Отправка сообщений в web приложение
            this.send2io = function (event, data) {
                io.to(_this.data_channels.DRONE_IO_ROOM).emit(event + '_' + _this.id, data)
            };

            // Контроллеры
            this.info = new InfoController(this);
            this.heartbeat = new HeartbeatController(this);
            this.RPC = new DroneRPCController(this);
            this.joystick = new JoystickController(this);
            this.commands = new CommandController(this);
            this.telem1 = new Telem1Controller(this);
            this.telem10 = new Telem10Controller(this);
            this.mission_download = new MissionDownloadController(this);
            this.mission_upload = new MissionUploadController(this);
            this.flight_path = new FlightPathController(this);
            this.log_download = new LogDownloadController(this);
            this.params = new ParamsController(this);

            Logger.info(`DroneServer started (${helpers.now_ms() - start_time}ms) for ${this.data.db_params.name}`);

        } catch(e){console.log(e);}
    }

    //
    // Обновление параметров из БД
    update(data){

        // Сравнить данные
        let udp_proxy_restart = ( this.data.db_params.udp_port !== data.udp_port && this.info.get('udp_ip_s') === 1 );
        let tcp_proxy_restart = ( this.data.db_params.gcs_tcp_port !== data.gcs_tcp_port && this.info.get('tcp_op_s') === 1 );

        // Переписать параметры в памяти
        _.mapKeys(data, (v, k) => { this.data.db_params[k] = v; });

        // Сообщить всем, что параметры изменены
        this.events.emit('paramsChanged');

        // Рестарт сервисов зависимых от параметров
        if( udp_proxy_restart ){
            systemRPC.req(RK.DRONE_UDP_PROXY_RESTART(), {drone_id: this.id, port: this.data.db_params.udp_port })
                .then(result => {
                    Logger.info('UDP RESTARTED ', result);
                })
                .catch( err => {
                    Logger.info('UDP ERR RESTARTED ', err);
                });
        }
        if( tcp_proxy_restart ){
            systemRPC.req(RK.DRONE_GCS_TCP_PROXY_RESTART(), {drone_id: this.id, port: this.data.db_params.udp_port })
                .then(function(data){
                    Logger.info('TCP RESTARTED ', data);
                })
                .catch( err => {
                    Logger.info('TCP ERR RESTARTED ', err);
                });
        }

    }

    //
    // Вызывается перед уничтожением экземпляра на сервере
    destroy(){

        // Обнулить все периодические функции и подписки
        this.events.emit('destroy');

        // Если запущены UDP и TCP серверы, то остановить их
        if( this.info.get('udp_ip_s') === 1 ){
            systemRPC.req(RK.DRONE_UDP_PROXY_STOP(), { drone_id: this.id })
                .then(function(data){
                    Logger.info('UDP STOPPED ', data);
                })
                .catch( err => {
                    Logger.info('UDP ERR STOP ', err);
                });
        }

        // Если запущен TCP Proxy, а порт изменен
        if( this.info.get('tcp_op_s') === 1 ){
            systemRPC.req(RK.DRONE_GCS_TCP_PROXY_STOP(), { drone_id: this.id })
                .then(function(data){
                    Logger.info('TCP STOPPED ', data);
                })
                .catch( err => {
                    Logger.info('TCP ERR STOP ', err);
                });
        }

        Logger.info('DroneServer destroyed ' + this.id);

    }

}


module.exports = DroneServer;
