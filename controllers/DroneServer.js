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
     ,helpers = require('./../utils/helpers')
     ,FlightPlanModel = require('../db_models/FlightPlan')
     ,{FLIGHT_MODES, AUTOPILOTS, FRAME_TYPES, MAV_STATE} = require('../defs/mavlink')
     ,{telem1_fields, telem10_fields} = require('./../defs/io_telemetry_fields')
     ,turf_helpers = require('@turf/helpers')
     ,turf_dist = require('@turf/distance').default
     ,DroneServersList = {};

const io = require('socket.io-emitter')({ host: server_config.REDIS_HOST, port: server_config.REDIS_PORT });


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

        //console.log('SL', seq, _this.mission_items.length);

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
    const mavlink = new MAVLink(drone.params.mav_sys_id, drone.params.mav_cmp_id, drone.params.mav_gcs_sys_id, drone.params.mav_gcs_cmp_id);

    //
    // Подписка на канал Redis с чистым MAVlink
    drone.redis.SubBuf.subscribe(drone.data_keys.MAVLINK_FROM_DRONE);
    // Сюда приходят MAVLink сообщения от дрона (0xFD, 0xFE)
    drone.redis.SubBuf.on('message', function(channel, message){
        if( drone.data_keys.MAVLINK_FROM_DRONE !== channel.toString() ) return;

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

        redisPubBuf.publish(drone.data_keys.MAVLINK_TO_DRONE, message_buffer);
        redisPubBuf.publish(RK.MAVLINK_TO_DRONE_MONITOR(), message_buffer);
    };

    // Обработка mavlink ошибок
    mavlink.errorHandler = function(err, err_msg){
        if( 'seqError' !== err ) Logger.info('MAV ERR' + ' ' + err + '  ' + (err_msg || ''));
        drone.data.message_counters.errors += 1;
    };

    // При изменении параметров дрона меняем параметры mavlink
    drone.events.on('paramsChanged', () => {
        drone.mavlink.sysid = drone.params.mav_sys_id;
        drone.mavlink.compid = drone.params.mav_cmp_id;
        drone.mavlink.gcs_sysid = drone.params.mav_gcs_sys_id;
        drone.mavlink.gcs_compid = drone.params.mav_gcs_cmp_id;
    });

    // При удалении и остановке дрона
    drone.events.on('destroy', () => {
        drone.redis.SubBuf.unsubscribe(drone.data_keys.MAVLINK_FROM_DRONE);
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
            redisClient.hset(this.drone.data_keys.DRONE_INFO_KEY, 'last_message_time', this.data.last_message_time);
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
        drone.redis.Sub.subscribe(this.drone.data_keys.DRONE_INFO_CHANNEL);
        // Обработка входящих сообщений
        drone.redis.Sub.on('message', (channel, data) => {

            // Обновление текущей информации
            if( drone.data_keys.DRONE_INFO_CHANNEL === channel ){
                this.set(JSON.parse(data), false); // false = НЕ СОХРАНЯТЬ, тк сюда публикуются уже сохраненные данные
            }

        });

        //
        // Отправка полной информации по запросу не чаще раза в 5 секунд
        this.sendInfo = _.throttle( () => { this.load().then( res => drone.send2io('info', res) ).catch( Logger.error )}, 5000);

        // При удалении и остановке дрона
        drone.events.on('destroy', () => {
            drone.redis.Sub.unsubscribe(this.drone.data_keys.DRONE_INFO_CHANNEL);
        });

    }

    // Загрузка данных из редиса
    load(){
        const _this = this;

        return new Promise(function(resolve, reject){
            rHGetAll(_this.drone.data_keys.DRONE_INFO_KEY)
                .then( res => {
                    _.mapKeys(res, (value, key) => {
                        _this.data[key] = parseFloat(value) || value; // преобразование строк в числа
                    });

                    _this.drone.events.emit('infoLoaded', _this.data);
                    resolve(_this.data);
                })
                .catch( err => {
                    console.log(err);
                    reject('Redis get error key ' + _this.drone.data_keys.DRONE_INFO_KEY)
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
                if( save ) redisClient.hset(this.drone.data_keys.DRONE_INFO_KEY, key, value.toString());
            }
        });

        // Измененные поля отправляем в браузер
        if( !_.isEmpty(changed_fields) ) this.drone.events.emit('infoChanged', changed_fields);

    };


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
                else drone.info.set({ft: 'unknown', ac: 'other'});

                // Обновить параметры автопилота в джойстике
                drone.joystick.setAPType();

            }

            fields.base_mode = parseInt(fields.base_mode);
            fields.custom_mode = parseInt(fields.custom_mode);

            //
            // Состояние арм / дисарм
            let armed = (128 & fields.base_mode ? 1 : 0);
            if( drone.telem1.get('armed') !== armed ) drone.events.emit((armed ? 'armed' : 'disarmed'));
            drone.telem1.set('armed', armed);

            //
            // Включен ли ручной режим управления
            drone.telem1.set('rc', (64 & fields.base_mode ? 1 : 0));

            //
            // Общие характеристики полетного режима
            drone.telem1.set('m_stab', ((16 & fields.base_mode) ? 1 : 0));
            drone.telem1.set('m_guid', ((8 & fields.base_mode) ? 1 : 0));
            drone.telem1.set('m_auto', ((4 & fields.base_mode) ? 1 : 0));
            drone.telem1.set('base_mode', fields.base_mode);
            drone.telem1.set('custom_mode', fields.custom_mode);

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
                heartbeat_info.downtime = (now - drone.info.get('last_message_time'));
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
                if( !joystick_interval && drone.params.joystick_enable ) joystick_interval = setInterval( () => {
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
            gps_speed = gps_speed > 0 && gps_speed < 10 ? gps_speed.toFixed(1) : gps_speed.toFixed(0);
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
                    if( this.get('custom_mode') === 11 ){
                        this.set('dest_point', [drone.info.get('h_pos_lat'), drone.info.get('h_pos_lon'), 'h']);
                    }
                    // AUTO mode (движение по точкам миссии)
                    else if( this.get('custom_mode') === 10 && mission_current > 0 ){
                        this.set('dest_point', drone.mission_download.getWP(mission_current));
                    }
                }

            }

            dest_point_timeout = helpers.now();

        });

        // 87 POSITION_TARGET_GLOBAL_INT !!! приходит только в PX4, аналог 62 в арудпилоте
        drone.mavlink.on('POSITION_TARGET_GLOBAL_INT', fields => {
            // Это сообщение приходит в автоматических режимах

            // vx, vy, vz - скорости м/с в локальной системе координат
            // значения становятся null после посадки и перед остановкой этих сообщений
            // Если нет скорости, то нет и точки назначения

            if( !fields.vx && !fields.vy && !fields.vz ){
                if( this.get('dest_point') ) this.set('dest_point', null);

                return;
            }


            // PX4 Copter
            if( 12 === drone.data.autopilot && 'copter' === drone.info.get('ac') && 'custom' === drone.data.modes_type ){
                // RTL mode (возврат домой)
                if( this.get('custom_mode') === 84148224 ){
                    this.set('dest_point', [drone.info.get('h_pos_lat'), drone.info.get('h_pos_lon'), 'h']);
                }
                // Mission mode (движение по точкам миссии)
                else if( this.get('custom_mode') === 67371008 ){
                    if( mission_current >= 0 ) this.set('dest_point', drone.mission_download.getWP(mission_current));
                }
                // В любом другом случае берем координаты точки назначения из этого сообщения
                else {
                    // Только если скорость больше 2
                    if( (Math.abs(fields.vx) + Math.abs(fields.vy)) > 2 ){
                        this.set('dest_point', [fields.lat_int/10000000, fields.lon_int/10000000, 'n']);
                        //console.log('OTHER dest', this.get('custom_mode'),   fields.lat_int/10000000, fields.lon_int/10000000);
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
            this.set('r', Math.round(fields.roll * (180/pi))); // Roll angle (rad, -pi..+pi) (Units: rad)
            this.set('p', Math.round(fields.pitch * (180/pi)));
            this.set('y', Math.round(fields.yaw * (180/pi)));
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
        drone.redis.Sub.subscribe(drone.data_keys.DRONE_UI_COMMANDS);
        // Как только приходит команда, проверяем этот ли канал, и отправляем на преобразование и исполнение
        drone.redis.Sub.on('message', (channel, data) => {
            // Команда с предварительной обработкой из браузера
            if( drone.data_keys.DRONE_UI_COMMANDS === channel ){
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
        // Запуск UDP сервера для дрона.
        drone.RPC.on(RK.START_DRONE_UDP(drone.id), (data, channel, response_callback) => {

            const udp_port = parseInt(drone.params.udp_port) || null;
            if( !udp_port ) return response_callback('UDP port not set');
            if( udp_port < common_config.DRONE_UDP_PORT_MIN || udp_port > common_config.DRONE_UDP_PORT_MAX ) return response_callback('UDP port not allowed');

            drone.RPC.req(RK.DRONE_UDP_PROXY_START(), {drone_id: drone.id, port: udp_port })
                .then( result => response_callback(null, result) )
                .catch( response_callback );

        });
        //
        // Остановка UDP сервера для дрона
        drone.RPC.on(RK.STOP_DRONE_UDP(drone.id), (data, channel, response_callback) => {

            drone.RPC.req(RK.DRONE_UDP_PROXY_STOP(), {drone_id: drone.id})
                .then( result => {
                    drone.info.set({udp_ip_s: 0, udp_ip_c: 'stopped'});
                    response_callback(null, result);
                })
                .catch( response_callback );

        });
        //
        // Запуск TCP сервера для GCS
        drone.RPC.on(RK.START_GCS_TCP(drone.id), (data, channel, response_callback) => {

            const tcp_port = parseInt(drone.params.gcs_tcp_port) || null;
            if( !tcp_port ) return response_callback('TCP port not set');
            if( tcp_port < common_config.GCS_TCP_PORT_MIN || tcp_port > common_config.GCS_TCP_PORT_MAX ) return response_callback('TCP port not allowed');

            drone.RPC.req(RK.DRONE_GCS_TCP_PROXY_START(), {drone_id: drone.id, port: tcp_port })
                .then( result => response_callback(null, result) )
                .catch(response_callback);

        });
        //
        // Остановка TCP сервера
        drone.RPC.on(RK.STOP_GCS_TCP(drone.id), (data, channel, response_callback) => {

            drone.RPC.req(RK.DRONE_GCS_TCP_PROXY_STOP(), {drone_id: drone.id})
                .then( result => {
                    drone.info.set({tcp_op_s: 0, tcp_op_c: 'stopped'});
                    response_callback(null, result);
                })
                .catch( response_callback );
        });

        // При удалении и остановке дрона
        drone.events.on('destroy', () => {
            drone.redis.Sub.unsubscribe(drone.data_keys.DRONE_UI_COMMANDS);
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
                    // TODO command set mode
                    this.drone.mavlink.sendMessage('SET_MODE', {
                        target_system: this.drone.mavlink.sysid
                        ,base_mode: this.drone.data.modes[data.params.mode].base
                        ,custom_mode: this.drone.data.modes[data.params.mode].custom
                    });
                    // Подтверждение отловится в обратном сообщении
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
                if( 3 === this.drone.data.autopilot && 'rover' === this.drone.info.get('ac') && 'custom' === this.drone.data.modes_type && this.drone.telem1.get('custom_mode') === 15 ){

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

                    //console.log('PX4 Copter NAV pOInt', data.params);

                }

            }

            // TODO Команда Посадка
            else if( 'land' === data.command ) {
                /*


                 */
            }

            // TODO Команда RTL
            else if( 'rtl' === data.command ) {
                /*


                 */
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

            // TODO Управление серво
            else if( 'move_servo' === data.command ) {
                /*


                 */
            }

            // Джойстик
            else if( 'joystick' === data.command && _this.drone.params.joystick_enable ){

                let x = parseInt(data.params.x1) || 0;
                let y = parseInt(data.params.y1) || 0;

                this.drone.joystick.set(x, y);

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
        this.pos_data = { jx: 0 ,jy: 0 ,jz: 0 ,jr: 0 };
        this.scheme = {x: 'jr', y: 'jz'};

        this.setAPType();
    }

    setAPType(){

        this.pos_data = { jx: 0 ,jy: 0 ,jz: 0 ,jr: 0 };

        // Каналы управления в зависимости от типа автопилота
        switch( this.drone.info.get('ac') ){
            case 'rover':
                /* PX4 */ if( 12 === this.drone.data.autopilot ) this.scheme = { x: 'jr', y: 'jz' };
                /* Ardupilot */ else if( 3 === this.drone.data.autopilot ) this.scheme = { x: 'jy', y: 'jz' };
                break;
            case 'copter':
                /* PX4 */ if( 12 === this.drone.data.autopilot ) this.scheme = { x: 'jr', y: 'jx' };
                /* Ardupilot */ else if( 3 === this.drone.data.autopilot ) this.scheme = { x: 'jr', y: 'jx' }; // jy
                break;
            default:
                this.scheme = { x: 'jx', y: 'jy' };
        }
    }

    // Установка положения джойстика, вызвается в CommandController
    set(x, y){
        // обновить время последних данных
        this.last_pos_time = helpers.now();

        // Выставить лимиты
        if( x > 50 ) x = 50;
        if( x < -50 ) x = -50;
        if( y > 50 ) y = 50;
        if( y < -50 ) y = -50;

        // В сообщении отправляются значения от -1000 до +1000
        this.pos_data[this.scheme['x']] = x*20; // *10 = половина, *20 = слишком резвый
        this.pos_data[this.scheme['y']] = y*20;

    }

    // Вызывается в heartbeat если подключены дрон и gcs в браузере, а также джойстик включен в настройках
    send2drone(){
        // Проверяем актуальность данных от джойстика
        let data_is_valid = (helpers.now() - this.last_pos_time) < 3;

        //
        // Реализация через MANUAL_CONTROL (69)

        // Отправляем сообщение
        this.drone.mavlink.sendMessage('MANUAL_CONTROL', {
             target: this.drone.mavlink.sysid
            ,target_component: this.drone.mavlink.compid
            ,x: data_is_valid ? this.pos_data.jx : 0
            ,y: data_is_valid ? this.pos_data.jy : 0
            ,z: data_is_valid ? this.pos_data.jz : 0
            ,r: data_is_valid ? this.pos_data.jr : 0
            ,buttons: 0
        });
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
                joystick_x_channel
                joystick_x_rev
                joystick_y_channel
                joystick_y_rev
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

        this.RPC = new NodeRedisRpc({ emitter: this.redis.Pub, receiver: this.redis.Sub });

        this.data_keys = {
             // Переменные и каналы redis и IO
             MAVLINK_FROM_DRONE: RK.MAVLINK_FROM_DRONE(params.id) // MAVLink с борта
            ,MAVLINK_TO_DRONE: RK.MAVLINK_TO_DRONE(params.id) // MAVLink на борт
            ,DRONE_UI_COMMANDS: RK.DRONE_UI_COMMANDS(params.id) // Канал с командами из браузера
            ,DRONE_INFO_CHANNEL: RK.DRONE_INFO_CHANNEL(params.id) // Канал с информацией
            ,DRONE_INFO_KEY: RK.DRONE_INFO_KEY(params.id) // Переменая с информацией о дроне
            ,DRONE_IO_ROOM: IK.DRONE_IO_ROOM(params.id) // Канал в io для исходящей телеметрии дрона
        };

        this.id = params.id;
        this.params = params;
        this.data = {
            // Тип автопилота
            autopilot: null // 3=Ardupilot, 12=PX4
            // Тип рамы
            ,type: null
            // список полетных режимов
            ,modes: null
            // по какому типу определять режим base или custom
            ,modes_type: null
            // Счетчики сообщений
            ,message_counters: {
                total: 0
                ,decoded: 0
                ,missed: 0
                ,errors: 0
                ,create_errors: 0
            }
        };

        // Инициализация MAVLink
        this.mavlink = new MAVLinkController(this);

        // Отправка сообщений в web приложение
        this.send2io = function(event, data){
            io.to(_this.data_keys.DRONE_IO_ROOM).emit(event + '_' + _this.id, data)
        };

        // Контроллеры
        this.info = new InfoController(this);
        this.heartbeat = new HeartbeatController(this);
        this.joystick = new JoystickController(this);
        this.commands = new CommandController(this);
        this.telem1 = new Telem1Controller(this);
        this.telem10 = new Telem10Controller(this);
        this.mission_download = new MissionDownloadController(this);
        this.mission_upload = new MissionUploadController(this);
        this.flight_path = new FlightPathController(this);

        Logger.info(`DroneServer started (${helpers.now_ms()-start_time}ms) for ${this.params.name}`);

    }

    //
    // Обновление параметров из БД
    update(data){

        // Сравнить данные
        let udp_proxy_restart = ( this.params.udp_port !== data.udp_port && this.info.get('udp_ip_s') === 1 );
        let tcp_proxy_restart = ( this.params.gcs_tcp_port !== data.gcs_tcp_port && this.info.get('tcp_op_s') === 1 );

        // Переписать параметры в памяти
        _.mapKeys(data, (v, k) => { this.params[k] = v; });

        // Сообщить всем, что параметры изменены
        this.events.emit('paramsChanged');

        // Рестарт сервисов зависимых от параметров
        if( udp_proxy_restart ){
            this.RPC.req(RK.DRONE_UDP_PROXY_RESTART(), {drone_id: this.id, port: this.params.udp_port })
                .then(function(data){
                    console.log('UDP RESTARTED ', data);
                })
                .catch( err => {
                    console.log('UDP ERR RESTARTED ', err);
                });
        }
        if( tcp_proxy_restart ){
            this.RPC.req(RK.DRONE_GCS_TCP_PROXY_RESTART(), {drone_id: this.id, port: this.params.udp_port })
                .then(function(data){
                    console.log('TCP RESTARTED ', data);
                })
                .catch( err => {
                    console.log('TCP ERR RESTARTED ', err);
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
            this.RPC.req(RK.DRONE_UDP_PROXY_STOP(), { drone_id: this.id })
                .then(function(data){
                    console.log('UDP STOPPED ', data);
                })
                .catch( err => {
                    console.log('UDP ERR STOP ', err);
                });
        }

        // Если запущен TCP Proxy, а порт изменен
        if( this.info.get('tcp_op_s') === 1 ){
            this.RPC.req(RK.DRONE_GCS_TCP_PROXY_STOP(), { drone_id: this.id })
                .then(function(data){
                    console.log('TCP STOPPED ', data);
                })
                .catch( err => {
                    console.log('TCP ERR STOP ', err);
                });
        }

        console.log('DroneServer destroyed ' + this.id);

    }

}


const DroneServerController = function(){
    return {
        start: function(drone){ // Instance of DroneModel или {} с параметрами
            try {
                DroneServersList[drone.id] = new DroneServer(drone);
            }
            catch(e){
                Logger.error('Error starting DroneServer instance');
                Logger.error(e);
            }
        }

        ,update: function(drone_data){
            try {
                if( _.has(DroneServersList, drone_data.id) && DroneServersList[drone_data.id] ) DroneServersList[drone_data.id].update(drone_data);
            }
            catch(e){
                Logger.error('Error destroying DroneServer instance');
                Logger.error(e);
            }
        }

        ,destroy: function(drone_id){
            try {
                if( _.has(DroneServersList, drone_id) ){
                    DroneServersList[drone_id].destroy();
                    setTimeout(function(){DroneServersList[drone_id] = null;},5000);
                }
            }
            catch(e){
                Logger.error('Error destroying DroneServer instance');
                Logger.error(e);
            }
        }
    };
}();


module.exports = DroneServerController;

