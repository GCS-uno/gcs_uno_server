"use strict";

import helpers from '../../../utils/helpers';
import Message from '../plugins/Message';
import DronesCollection from '../models/DronesCollection';
import {telem1_fields, telem10_fields, dji_telem1_fields} from '../../../defs/io_telemetry_fields';
import DroneMarker from './drone_marker';
import DroneHeartbeat from './drone_heartbeat';
import DroneFlightPath from './drone_flight_path';
import {STATUSES_LIST_LIMIT, home_marker, GoHereMenu } from "../views/shared/drones_view_els";



/*

    Класс MAVDroneClient

 */
class MAVDroneClient {

    constructor(drone_id){

        const _this = this;

        // SocketIoService reference
        this.socket = window.app.getService('io');

        this.drone = {

             id: drone_id
            ,item: DronesCollection.getItem(drone_id)

            ,isOnline: function(){
                return parseInt(_this.drone_data.info.get('online')) === 1;
            }

            // Joystick controller
            ,joystick: function(){

                let jlx = 0, jly = 0, jrx = 0, jry = 0;

                return {
                    get: function(){
                        return { jlx: jlx, jly: jly, jrx: jrx, jry: jry };
                    }
                    ,set_left: function(pos){
                        jlx = Math.round(pos['x']);
                        jly = Math.round(pos['y']);
                    }
                    ,set_right: function(pos){
                        jrx = Math.round(pos['x']);
                        jry = Math.round(pos['y']);
                    }
                }
            }()

        };

        this.drone_data = { // == redis_keys -> DRONE_INFO_KEY
             info: function(){
                const record = new webix.DataRecord();

                return {
                    get: function(key){
                        let values = record.getValues();

                        if( !key ) return values;

                        if( values.hasOwnProperty(key) ) return values[key];
                        else return null;

                    }
                    ,set: function(new_values = {}){

                        let old_values = webix.copy(record.getValues());
                        record.setValues(new_values, true);

                        // Проверить изменения, поставить оффлайн или онлайн
                        // Установка ОНЛАЙН или ОФФЛАЙН
                        if( new_values.hasOwnProperty('online') && parseInt(new_values.online) !== parseInt(old_values.online) ){
                            if( parseInt(new_values.online) === 1 ) _this.status_online();
                            else   _this.status_offline();
                        }
                        // Если состояние онлайн не менялось, а поменялся тип автопилота или рамы, то нужно переделать кнопки под тип автопилота
                        else if( (new_values.hasOwnProperty('at') && old_values.at !== new_values.at) || (new_values.hasOwnProperty('ft') && old_values.ft !== new_values.ft) ){
                            if( _this.drone.isOnline() ){
                                _this.status_online();
                                // а также запросить новый список режимов
                                _this.command('modes_list');
                            }
                            else  _this.status_offline();
                        }

                        // Переключение выключателя Drone UDP Server
                        if( new_values.hasOwnProperty('udp_ip_s') && parseInt(new_values.udp_ip_s) !== parseInt(old_values.udp_ip_s) && _this.view_enabled ){
                            const sw = _this.view.$scope.info_popup.queryView({localId: 'sw:drone_udp'});
                            sw.blockEvent();
                            sw.setValue(parseInt(new_values.udp_ip_s));
                            sw.unblockEvent();
                        }

                        // Переключение выключателя GCS TCP Server
                        if( new_values.hasOwnProperty('tcp_op_s') && parseInt(new_values.tcp_op_s) !== parseInt(old_values.tcp_op_s) && _this.view_enabled ){
                            const sw = _this.view.$scope.info_popup.queryView({localId: 'sw:gcs_tcp'});
                            sw.blockEvent();
                            sw.setValue(parseInt(new_values.tcp_op_s));
                            sw.unblockEvent();
                        }

                        // Home position
                        if( new_values.hasOwnProperty('h_pos_lat') && new_values.hasOwnProperty('h_pos_lon') && new_values.h_pos_lat && new_values.h_pos_lon ){
                           _this.home_marker.setPosition({lat: parseFloat(new_values.h_pos_lat), lng: parseFloat(new_values.h_pos_lon)});

                           _this.mission.setHome(parseFloat(new_values.h_pos_lat), parseFloat(new_values.h_pos_lon));

                            if( _this.view_enabled && _this.view_els.map ){
                                _this.home_marker.setMap(_this.view_els.map);
                            }
                        }

                        //
                        // Запросить список полетных режимов если списка нет, а автопилот распознан
                        if( !_this.drone_data.modes && old_values.at && _this.drone.isOnline() ) _this.command('modes_list');


                    }
                    ,record: function(){
                        return record;
                    }
                }
            }() // Отражает данные ключа redis DRONE_INFO_KEY

            ,params: {} // Параметры из БД

            // Телеметрия
            ,telem_1hz: new webix.DataRecord()
            ,telem_10hz: new webix.DataRecord()

            ,modes: null
            ,modes_names: {}

            // Коллекция статусов
            ,statuses_collection: new webix.DataCollection({
                on: {
                    'onAfterAdd': function () { // id
                        if( this.count() > STATUSES_LIST_LIMIT ){
                            this.remove(this.getLastId());
                        }
                    }
                }

                ,scheme:{
                    $init: function(obj){
                        if( obj.severity <= 3 ) obj.$css = "list_red";
                        else if( obj.severity <= 5 ) obj.$css = "list_yel";
                        else obj.$css = "list_white";
                    }
                }
            })

        };

        this.view = null;
        this.view_enabled = false;
        this.view_els = {};

        this.check_online_interval = null;
        this.ping_interval = null;

        this.player = null;
        this.videoURL = null;

        this.RPC = (method, data={}) => {
            return _this.socket.rpc('droneRPC', {drone_id: _this.drone.id, method: method, data: data});
        };

        // Маркер на карте
        this.drone_marker = DroneMarker(this);

        // Маркер точки старта
        this.home_marker = home_marker();

        // Будущий обработчик клика по карте
        this.mapClickListener = null;

        // Go here context menu на карте
        const go_here_menu = new GoHereMenu();
        let ignore_next_click = false;
        go_here_menu.gohere = function(lat, lng){
            ignore_next_click = true;
            //Message.info('Go here ' + lat + ' - ' + lng);
            go_here_menu.close();

            _this.command('nav2p', {lat: lat, lng: lng});
        };

        // Обработчик кликов на карте для установки точки назначения
        this.mapClickHandler = function(event){
            console.log(event.latLng.lat(), event.latLng.lng());

            if( ignore_next_click ){
                ignore_next_click = false;
                return;
            }

            if( !_this.drone.isOnline() || parseInt(_this.drone_data.telem_1hz.getValues().armed) === 0 ) return;

            go_here_menu.open(_this.view_els.map, event.latLng.lat(), event.latLng.lng());
        };

        // Отправка высокоуровневых команд для предобработки на сервере
        this.command = function(command, params){
            if( !params ) params = {};

            // Список команд для которых нужно ждать ответа
            const MAV_CMD = {
                // команды MAV_CMD
                 takeoff: 22
                ,land: 11
                ,rtl: 11
                ,guided: 11
                ,md_loiter: 11
                ,cm_loiter: 17
                ,switch_relay: 181
                ,set_mode: 11 // MAV_CMD_DO_SET_MODE
                ,arm: 400

                // Свой велосипед
                ,get_mission: 1001

            };

            return new Promise(function(resolve, reject){
                // Отправляем команду
                _this.socket.emit('drone_command_' + _this.drone.id, {
                    command: command
                    ,params: params
                });


                // Установка ждуна для ответа, если команда в списке
                if( MAV_CMD.hasOwnProperty(command) ) {

                    let command_timeout = null;
                    let command_timeout_func = function () {
                        _this.command_ack.clear(MAV_CMD[command]);
                        reject('timeout');
                    };

                    // Если не будет получен ответ через обозначенное то вернуть ошибку таймаута
                    command_timeout = setTimeout(command_timeout_func, 5000);

                    // Включить ожидание ответа на команду
                    _this.command_ack.wait(MAV_CMD[command], function (result) {
                        // отмена таймаута
                        clearTimeout(command_timeout);

                        // Команда выполнена успешно MAV_RESULT_ACCEPTED
                        if (0 === result) {
                            _this.command_ack.clear(MAV_CMD[command]);
                            resolve('success');
                        }
                        // MAV_RESULT_TEMPORARILY_REJECTED
                        else if (1 === result) {
                            _this.command_ack.clear(MAV_CMD[command]);
                            reject('rejected');
                        }
                        // MAV_RESULT_DENIED
                        else if (2 === result) {
                            _this.command_ack.clear(MAV_CMD[command]);
                            reject('denied');
                        }
                        // MAV_RESULT_UNSUPPORTED
                        else if (3 === result) {
                            _this.command_ack.clear(MAV_CMD[command]);
                            reject('unsupported');
                        }
                        // MAV_RESULT_FAILED
                        else if (4 === result) {
                            _this.command_ack.clear(MAV_CMD[command]);
                            reject('failed');
                        }
                        // MAV_RESULT_IN_PROGRESS
                        else if (5 === result) {
                            command_timeout = setTimeout(command_timeout_func, 10000);
                            //resolve('in_progress');
                        }
                        else {
                            _this.command_ack.clear(MAV_CMD[command]);
                            reject(result);
                        }
                    });

                }
                // или возврат
                else resolve('success');

            });

        };

        // Хранение и обработка подтверждений команд
        this.command_ack = function(){

            let list = {};

            return {
                wait: function(command_id, callback){
                    list[command_id] = callback;
                }
                ,set: function(command_id, result){
                    if( list[command_id] ){
                        list[command_id](result);
                    }
                    else {
                        if( command_id === 176 && list[11] ) list[11](result);
                    }
                }
                ,clear: function(command_id) {
                    if( list[command_id] ){
                        list[command_id] = undefined;
                    }
                }
            };
        }();

        // Отправка heartbeat и джойстика
        this.heartbeat = DroneHeartbeat(this);

        // След
        this.flight_path = DroneFlightPath(this);

        // Линия до целевой точки и маркер
        this.destination_path = function(){

            const path = new google.maps.Polyline({
                path: [{lat:0,lng:0},{lat:0,lng:0}],
                geodesic: true,
                strokeOpacity: 0,
                //strokeColor: '#ff5ae9',
                //strokeOpacity: 1.0,
                //strokeWeight: 2,
                zIndex: 5,
                icons: [{
                    icon: {
                        path: 'M 0,-1 0,1',
                        strokeOpacity: 0.8,
                        strokeColor: '#ff1500',
                        scale: 3
                    },
                    offset: '0',
                    repeat: '30px'
                }]
            });
            const marker = new google.maps.Marker({
                zIndex: 2
                ,icon: {
                    path: google.maps.SymbolPath.CIRCLE
                    ,scale: 8
                    ,fillColor: '#ff2f31'
                    ,fillOpacity: 0.9
                    ,strokeColor: '#000000'
                    ,strokeWeight: 2
                    ,zIndex: 2000
                }
            });

            return {

                set: function(from, to){

                    path.getPath().setAt(0, new google.maps.LatLng(from[0], from[1]));
                    path.getPath().setAt(1, new google.maps.LatLng(to[0], to[1]));
                    marker.setPosition(new google.maps.LatLng(to[0], to[1]));

                    if( _this.view_enabled && _this.view ){
                        path.setMap(_this.view_els.map);
                        // Если движение домой или на точку миссии (уже есть маркеры), то маркер не рисуем
                        if( to[2] && ('h' === to[2] || 'm' === to[2]) ){
                            marker.setMap(null);
                        }
                        else marker.setMap(_this.view_els.map);

                    }
                }

                ,show: function(){
                    if( path.getPath().getLength() > 1 ) marker.setMap(_this.view_els.map);
                }

                ,hide: function(){
                    path.setMap(null);
                    marker.setMap(null);
                }

            };
        }();

        // Полетный план
        this.mission = function(){

            // Линия миссии
            const mission_path = new google.maps.Polyline({
                path: [],
                geodesic: true,
                strokeColor: '#ffbd4d',
                strokeOpacity: 0.8,
                strokeWeight: 2,
                zIndex: 3
            });

            // линия возврата от последней точки к дому
            const rtl_path = new google.maps.Polyline({
                path: [{lat:0,lng:0},{lat:0,lng:0}],
                geodesic: true,
                strokeOpacity: 0,
                zIndex: 3,
                icons: [{
                    icon: {
                        path: 'M 0,-1 0,1',
                        strokeOpacity: 0.8,
                        strokeColor: '#120dff',
                        scale: 3
                    },
                    offset: '0',
                    repeat: '20px'
                }]
            });

            let rtl = false;

            // Маркеры поворотных точек
            let markers = [];

            return {

                // Загрузка и визуализация
                load: function(data){
                    if( typeof data !== 'object' || !data.length ) return;

                    // Очистить предыдущие маркеры
                    markers.forEach( m => m.setMap(null) );
                    markers = [];

                    // команды в элементах миссии для которых создается точка и маркер на карте.
                    // !!! Такой же список в модели FlightPlan для постороения миссии на карте
                    const map_marker_commands = [16, 17, 18, 19, 21, 31, 82, 85];

                    // сюда соберем точки для линии
                    let path_points = [];
                    // перебираем элементы миссии
                    let marker_label = 1;
                    data.map(function(point){
                        // если команду нужно отобразить на карте в виде маркера
                        if( map_marker_commands.indexOf(point.command) !== -1 ){
                            // добавить точку в линию
                            path_points.push({lat: point.x, lng: point.y});
                            // создать маркер
                            let marker = new google.maps.Marker({
                                position: {lat: point.x, lng: point.y}
                                ,zIndex: 4
                                ,icon: {
                                    path: google.maps.SymbolPath.CIRCLE
                                    ,scale: 11
                                    ,fillColor: '#ffbd4d'
                                    ,fillOpacity: 0.8
                                    ,strokeColor: '#000000'
                                    ,strokeWeight: 2
                                    ,zIndex: 2000
                                }
                                ,label: {text: marker_label.toString(), color: '#000000'}
                                ,title: `c: ${point.command}, seq: ${point.seq}`
                            });
                            marker.set('seq', point.seq);
                            marker.set('lbl', marker_label);
                            marker.addListener('click', function(event){
                                Message.info('Mission item clicked seq ' + this.get('seq'));
                            });

                            markers.push(marker);

                            marker_label++;
                        }
                    });

                    // Если последняя команда RTL, то включаем линию возврата
                    if( 20 === data[data.length-1].command ) {
                        rtl = true;
                        // последнюю точку добавляем в начало возвратной линии
                        rtl_path.getPath().setAt(0, new google.maps.LatLng(path_points[path_points.length-1].lat, path_points[path_points.length-1].lng));

                    }

                    mission_path.setPath(path_points);

                    this.show();

                },

                // Включить отображение
                show: function(){
                    if( _this.view_enabled && _this.view && mission_path.getPath().getLength() ) {
                        mission_path.setMap(_this.view_els.map);
                        if( rtl ) rtl_path.setMap(_this.view_els.map);
                        for (let i = 0, k = markers.length; i < k; i++) markers[i].setMap(_this.view_els.map);
                    }
                },

                // Скрыть
                hide: function(){
                    mission_path.setMap(null);
                    //start_up_path.setMap(null);
                    rtl_path.setMap(null);
                    for (let i = 0, k = markers.length; i < k; i++) markers[i].setMap(null);
                },

                // Установить точку возврата
                setHome: function(lat, lng){
                    rtl_path.getPath().setAt(1, new google.maps.LatLng(lat, lng));
                },

                // Очистить
                clear: function(){
                    markers.forEach( m => m.setMap(null) );
                    markers = [];
                    mission_path.getPath().clear();
                    mission_path.setMap(null);
                    rtl_path.setPath([{lat:0,lng:0},{lat:0,lng:0}]);
                    rtl_path.setMap(null);
                }

            };
        }();

        // Пришла телеметрия 1Гц
        const telem1_received = function(telem1){
            if( !telem1 || !telem1.length || telem1.length !== telem1_fields.length ) return;


            // Расшифровка новых данных (преобразование из коллекции в именуемый объект)
            let new_values = {};
            telem1.forEach( (v, i) => { new_values[telem1_fields[i]] = v; } );

            // Сохранение новых данных в Record для синхронизации с виджетами и контроллерами
            _this.drone_data.telem_1hz.setValues(new_values, true);

            // Обновление информации о дроне
            _this.drone_data.info.set({
                online: 1
                ,last_message_time: helpers.now()
                ,sys_status: new_values.sys_status
            });

            // Если есть точка назначения, то установить путь
            if( new_values.dest_point )  _this.destination_path.set([new_values.lat, new_values.lon], new_values.dest_point);
            else  _this.destination_path.hide();

            //
            // Обновить информацию на экране
            if( _this.view_enabled && _this.view ){

                // Название текущего полетного режима у коптера
                if( 'copter' === _this.drone_data.info.get('ac') ){
                    let mode_name = 'Unknown';
                    if( _this.drone_data.modes_names.hasOwnProperty(new_values.mode) ) mode_name = _this.drone_data.modes_names[new_values.mode];
                    if( _this.view_els.label_mode ) _this.view_els.label_mode.setValue('Mode: ' + mode_name);
                }
                // Или установить текущий в списке у ровера
                else if( 'rover' === _this.drone_data.info.get('ac') ) {
                    if( _this.view_els.mode_select.isVisible() ) {
                        _this.view_els.mode_select.blockEvent();
                        _this.view_els.mode_select.setValue( new_values.mode );
                        _this.view_els.mode_select.unblockEvent();
                    }
                }

                // Если дрон активирован
                if( parseInt(new_values.armed) === 1 ){
                    // Текущее состояние ARM
                    if( _this.view_els.label_armed && _this.view_els.label_armed.isVisible() ) _this.view_els.label_armed.setValue("ARMED");
                    // Скрыть кнопку ARM
                    if( _this.view_els.arm_btn.isVisible() ) _this.view_els.arm_btn.hide();
                    // Показать кнопку DISARM
                    if( !_this.view_els.disarm_btn.isVisible() ) _this.view_els.disarm_btn.show();


                    // Если в ArduCopter
                    if( "copter" === _this.drone_data.info.get("ac") && "ArduPilot" === _this.drone_data.info.get("at") ){

                        // Кнопку Takeoff показать если это коптер, статус standby, полетный режим Guided
                        if( new_values.mode === 4 && new_values.sys_status === "standby" ) show_view_els(["takeoff_btn"]);
                        else hide_view_els(["takeoff_btn"]);

                        // Кнопку Land показать если это коптер, статус active, любой режим кроме Land
                        if( new_values.sys_status === "active" && new_values.mode !== 9 ) show_view_els(["land_btn"]);
                        else hide_view_els(["land_btn"]);

                        // Кнопку RTL показать если это коптер, статус active, любой режим кроме RTL
                        if( new_values.sys_status === "active" && new_values.mode !== 6 ) show_view_els(["rtl_btn"]);
                        else hide_view_els(["rtl_btn"]);

                    }
                }
                // Если нет
                else {
                    // Текущее состояние Disarmed
                    _this.view_els.label_armed.setValue("Disarmed");

                    if( _this.view_els.disarm_btn.isVisible() ) _this.view_els.disarm_btn.hide();
                    if( !_this.view_els.arm_btn.isVisible() ) _this.view_els.arm_btn.show();
                    hide_view_els(["takeoff_btn","land_btn","rtl_btn"]);
                }

            }

        };

        // Пришла телеметрия 10Гц
        const telem10_received = function(telem10){
            if( !telem10.length || telem10.length !== telem10_fields.length ) return;

            let values = {};
            telem10.forEach( (v, i) => { values[telem10_fields[i]] = v; } );
            _this.drone_data.telem_10hz.setValues(values);
        };

        //
        // Ответ на запрос присоединения
        const connection_response = function(resp){

            if( 'success' === resp.status ){

                // Положительный ответ приходит вместе с полной информацией о дроне
                // Обновляем инфо
                _this.drone_data.info.set(resp.info);
                _this.drone_data.params = resp.params;

                //
                //  Навешиваем события на сокет

                // Телеметрия
                _this.socket.off('telem1_' + _this.drone.id);
                _this.socket.on('telem1_' + _this.drone.id, telem1_received);

                _this.socket.off('telem10_' + _this.drone.id);
                _this.socket.on('telem10_' + _this.drone.id, telem10_received);

                // Статусы
                _this.socket.off('status_text_' + _this.drone.id);
                _this.socket.on('status_text_' + _this.drone.id, data => {
                    data.id = webix.uid();
                    _this.drone_data.statuses_collection.add(data, 0);

                    if( _this.view_enabled && _this.view ){
                        data.severity <= 3 ? Message.error(data.text) : Message.info(data.text);
                    }

                });

                // Общая информация по дрону
                _this.socket.off('info_' + _this.drone.id);
                _this.socket.on('info_' + _this.drone.id, (data) => {
                    if( parseInt(data.online) ) data.last_message_time = helpers.now();
                    _this.drone_data.info.set(data);
                });

                // Список полетных режимов
                _this.socket.off('modes_' + _this.drone.id);
                _this.socket.on('modes_' + _this.drone.id, function(modes_list){

                    if( modes_list && modes_list.length ){
                        _this.drone_data.modes = [];
                        modes_list.forEach(function(item){
                            _this.drone_data.modes.push({id: item[0], value: item[1]});
                            _this.drone_data.modes_names[item[0]] = item[1];
                        });

                        if( _this.view_enabled && _this.view && _this.view_els.mode_select ){
                            _this.view_els.mode_select.getList().parse(_this.drone_data.modes);
                            if( !_this.view_els.mode_select.isEnabled() ) _this.view_els.mode_select.enable();
                            if( _this.drone_data.telem_1hz.getValues().mode !== null ){
                                _this.view_els.mode_select.blockEvent();
                                _this.view_els.mode_select.setValue(_this.drone_data.telem_1hz.getValues().mode);
                                _this.view_els.mode_select.unblockEvent();
                            }
                        }
                    }
                });

                // Сообщение с подтверждением исполнения команды
                _this.socket.off('com_ack_' + _this.drone.id);
                _this.socket.on('com_ack_' + _this.drone.id, data => {
                    // Передается в ожидающую функцию
                    _this.command_ack.set(data.command, data.result);  // MAV_CMD, MAV_RESULT
                });

                // Точки следа
                _this.socket.off('fp_' + _this.drone.id);
                _this.socket.on('fp_' + _this.drone.id, _this.flight_path.setPath);

                //
                // Загрузка бортовой миссии
                _this.socket.off('board_mission_' + _this.drone.id);
                _this.socket.on('board_mission_' + _this.drone.id, (response) => {
                    if( 'success' === response.status ) _this.mission.load(response.mission_data);
                });

                //
                // Статус загрузки логфайла
                _this.socket.off('report_log_dl_' + _this.drone.id);
                _this.socket.on('report_log_dl_' + _this.drone.id, (response) => {
                    //console.log(response);

                    // Если вид не открыт, то ничего не делаем
                    if( !_this.view || !_this.view_enabled ) return;

                    // Если открыто окно со списком логов
                    if( _this.view_els.logs_list_popup && _this.view_els.logs_list_popup.isVisible() ){
                        // Найти в списке лог по id и поставить ему статус "загрузка"
                        let log_item = _this.view_els.logs_list_table.getItem(response.id);
                        if( log_item ){
                            if( 'pend' === response.status && response.hasOwnProperty('c') ){
                                log_item.s = 'dl';
                                log_item.dp = response.c.p;
                            }
                            else if( 'pars' === response.status ){
                                log_item.s = 'pr';
                            }
                            else if( 'success' === response.status ){
                                log_item.s = 'v';
                                log_item.log_id = response.log_id;
                            }
                            else {
                                log_item.s = 0;
                            }
                            _this.view_els.logs_list_table.updateItem(response.id, log_item);
                        }
                    }

                    // Если окно со списком не открыто, тогда открываем попап загрузки логов
                    else if( _this.view_els.log_dl_popup ){
                        if( !_this.view_els.log_dl_popup.isVisible() && 'stopped' !== response.status ) {
                            _this.view_els.log_dl_popup.show();
                            _this.view_els.log_dl_popup.showProgress({ type: 'top', position: 0.01, hide: false});
                        }

                        // Данные для информации в окошке
                        _this.view_els.log_dl_msg.setValues(response);

                        if( response.hasOwnProperty('c') ){
                            let pr_pos = response.c.p/100;
                            if( pr_pos < 0.01 ) pr_pos = 0.01;
                            _this.view_els.log_dl_popup.showProgress({ type: 'top', position: pr_pos, hide: false});
                            if( !_this.view_els.log_dl_stop.isVisible()) _this.view_els.log_dl_stop.show();
                            if( _this.view_els.log_dl_close.isVisible()) _this.view_els.log_dl_close.hide();
                            if( _this.view_els.log_dl_view.isVisible()) _this.view_els.log_dl_view.hide();
                        }
                        else if( 'pars' === response.status ){
                            _this.view_els.log_dl_popup.showProgress({ type: 'top', position: 1, hide: false});

                        }
                        else if( 'failed' === response.status ){
                            if( _this.view_els.log_dl_stop.isVisible()) _this.view_els.log_dl_stop.hide();
                            if( !_this.view_els.log_dl_close.isVisible()) _this.view_els.log_dl_close.show();
                            if( _this.view_els.log_dl_view.isVisible()) _this.view_els.log_dl_view.hide();
                        }
                        else if( 'success' === response.status ){
                            console.log('success');
                            _this.view_els.log_dl_popup.showProgress({ type: 'top', position: 1, hide: false});
                            if( _this.view_els.log_dl_stop.isVisible()) _this.view_els.log_dl_stop.hide();
                            if( !_this.view_els.log_dl_close.isVisible()) _this.view_els.log_dl_close.show();

                            if( response.log_id ) {
                                console.log('Ready to open log');
                                _this.drone_data.latest_log_id = response.log_id;
                                if (!_this.view_els.log_dl_view.isVisible()) _this.view_els.log_dl_view.show();
                            }
                        }
                        else {
                            _this.view_els.log_dl_popup.hideProgress();
                        }
                    }

                });


                //
                // Принудительно поставить оффлайн, если не было сообщений больше 4 секунд
                _this.check_online_interval = setInterval(function(){
                    if( !_this.drone.isOnline() ) return;
                    // если включить проверку на онлайн, то не будет обновляться время последнего сообщения

                    // Если последнее сообщение было больше 4 секунд назад, то ставим оффлайн
                    let last_message_time = parseInt(_this.drone_data.info.get('last_message_time')) || 0;
                    if( helpers.now() - last_message_time > 4 ) _this.drone_data.info.set({online: 0});

                }, 5000);

            }
            else {
                Message.error('Failed to connect ' + _this.drone.item.name);
            }

        };


        // Отправляем запрос на подключение к каналу телеметрии сейчас
        _this.socket.emit('drone_gcs_connect', _this.drone.id, connection_response);

        // И после реконнекта socket.io
        this.socketOnConnect = function(){
            if( !_this.drone ){
                _this.socket.off("connect", this);
                return;
            }
            _this.socket.emit('drone_gcs_connect', _this.drone.id, connection_response);
        };
        _this.socket.on('connect', _this.socketOnConnect);

        // Показывает элементы на экране из списка [view1, view2]
        const show_view_els = function(els){
            els.map( el => _this.view_els[el] ? _this.view_els[el].show() : '');
        };
        // Скрывает элементы на экране из списка [view1, view2]
        const hide_view_els = function(els){
            els.map( el => _this.view_els[el] ? _this.view_els[el].hide() : '');
        };

        //
        // Дрон онлайн (ставится когда приходит инфо {online:1}
        this.status_online = function(){

            console.log("MAVDrone status_online begin");

            // Сообщение дрон ОНЛАЙН
            if( _this.drone.item.status !== 'online' ) Message.info(_this.drone.item.name + ' ONLINE');

            // Обновление статуса в таблице
            _this.drone.item.status = 'online';
            DronesCollection.updateItem(_this.drone.id, {status: 'online'});

            //
            // Принудительно поставить оффлайн, если не было сообщений больше 4 секунд
            _this.check_online_interval = setInterval(function(){
                if( !_this.drone.isOnline() ) return;
                // если включить проверку на онлайн, то не будет обновляться время последнего сообщения

                // Если последнее сообщение было больше 4 секунд назад, то ставим оффлайн
                let last_message_time = parseInt(_this.drone_data.info.get('last_message_time')) || 0;
                if( helpers.now() - last_message_time > 4 ) _this.drone_data.info.set({online: 0});

            }, 4000);

            console.log("MAVDrone status_online end");

            // Обновление вида, если он открыт у дрона
            _this.view_online();

        };

        //
        // Обновление вида, если он открыт у дрона
        this.view_online = function(){

            console.log("MAVDrone view_online begin");

            if( !_this.view_enabled || !_this.view ) return;

            if( _this.home_marker.getPosition() ) _this.home_marker.setMap(_this.view_els.map);

            hide_view_els(['top_tpl_offline']);

            // Подготовка элементов для дрона
            if( _this.drone_data.info.get('ac') === 'copter' ){
                hide_view_els(['mode_select']);
                show_view_els(['label_mode','btn_guided','btn_cm_loiter']);
            }
            // Для остальных
            else if( _this.drone_data.info.get('ac') ) {
                hide_view_els(['label_mode','btn_guided','takeoff_btn','land_btn','rtl_btn','btn_cm_loiter']);
                show_view_els(['mode_select']);
            }

            // Общие
            show_view_els(['label_armed','top_icon_statuses','top_icon_actions']);
            _this.view_els.telem_top.show({y:60, x: 55});

            // Начало отправки heartbeat. Остановка по закрытию панели управления
            _this.heartbeat.start();

            // Загрузить с сервера точки следа
            _this.command('get_fp');

            // Полетный план
            _this.mission.show();
            // Путь назначения
            _this.destination_path.show();

            console.log("MAVDrone view_online end");
        };

        //
        // Дрон оффлайн
        this.status_offline = function(){

            console.log("MAVDrone status_offline begin");

            // Сообщение дрон ОФФЛАЙН
            if( _this.drone.item.status === 'online' ) Message.warning(_this.drone.item.name + ' OFFLINE');

            // Обновление статуса в таблице
            _this.drone.item.status = 'offline';
            DronesCollection.updateItem(_this.drone.id, {status: 'offline'});

            _this.heartbeat.stop();
            clearInterval(_this.check_online_interval);
            _this.check_online_interval = null;

            console.log("MAVDrone status_offline end");

            _this.view_offline();

        };

        //
        // Обновление вида, если он открыт у дрона
        this.view_offline = function(){
            console.log("MAVDrone view_offline begin");

            // Обновление вида, если он открыт у дрона
            if( !_this.view_enabled || !_this.view  ) return;

            // Скрыть элементы управления
            hide_view_els(['label_armed','arm_btn','disarm_btn','label_mode','mode_select','btn_guided','takeoff_btn','land_btn','rtl_btn','btn_cm_loiter',
                'takeoff_popup','params_list_popup','logs_list_popup','top_icon_actions']);
            // Показать элементы управления
            show_view_els(['top_icon_info','top_icon_statuses','top_tpl_offline']);

            // FIXME
            _this.view_els.telem_top.show({y:60, x: 60});

            console.log("MAVDrone view_offline end");

        };

        //
        // Инициализация видеоплеера
        let playerInitTimeout = null;
        this.initVideoPlayer = () => {
            if( playerInitTimeout ){
                clearTimeout(playerInitTimeout);
                playerInitTimeout = null;
            }

            if( this.player ) this.player.destroy();

            if( !this.videoURL || this.videoURL.length < 10 ) return;

            if( this.player && this.player.destroy ){
                this.player.destroy();
                this.player = null;
            }

            console.log("Video URL " + this.videoURL);

            // Wowza Player
            if( this.videoURL.includes("wowza.com/") ){
                try {
                    this.player = WowzaPlayer.create("video_player",
                        {
                            license: window.WowzaPlayerLicense,
                            sourceURL: this.videoURL,
                            title:"",
                            description:"",
                            autoPlay: true,
                            mute: true,
                            volume: 75,
                            bufferPlayDuration: 10
                        }
                    );

                    // Wowza Player Events
                    this.player.onLoad( () => {
                        console.log("Wowza Player loaded");
                    } );

                    this.player.onError( err => {
                        console.log("Wowza Player error", err);
                        if( !playerInitTimeout ) setTimeout(() => {this.initVideoPlayer()}, 3000);
                    } );

                    this.player.onPlaybackFailure( err => {
                        console.log("Wowza Player failure", err);
                        if( !playerInitTimeout ) setTimeout(() => {this.initVideoPlayer()}, 3000);
                    } );

                    this.player.onStateChanged( state => {
                        console.log("Wowza Player state changed", state);
                    } );
                }
                catch (e){
                    console.log(e);
                }

            }

            // Nimble Player
            else {
                try {
                    this.player = window.SLDP.init({
                        container: 'video_player',
                        stream_url: this.videoURL,
                        width: 500,
                        height: 285,
                        buffering: 0,
                        latency_tolerance: 0, //50,
                        key_frame_alignment: true,
                        adaptive_bitrate: false,
                        muted: true,
                        autoplay: true,
                        splash_screen: 'static/white_noise.gif',
                        reconnects: 10
                    });

                    window.SLDPH.reset();
                    window.SLDPH.on("showNotPlaying", () => {
                        setTimeout( () => {
                            this.initVideoPlayer();
                        }, 10000);
                    });

                    console.log("init Player with " + this.videoURL);
                }
                catch(e){
                    console.log(e);
                }
            }

        };

        console.log("MAVLink Drone client init OK");

    } // 1043, 1051, 11096, 1142


    //
    // Обновление параметров после редактирования
    updateParams(params){
        this.drone_data.params = params;
        // перезапустить heartbeat усли он включен, включает или отключает джойстик
        if( this.heartbeat.status() ) this.heartbeat.start();
    }


    //
    // Включение обновления вида своими данными
    view_start(view){

        console.log("MAVDrone view_start begin");

        this.view = view;
        this.view_enabled = true;

        const _this = this;

        view.$scope.$$('map:drone').getMap(true).then( mapObj => {

            //
            //  Объекты вида
            this.view_els = {
                //
                // Верхняя панель

                // Кнопка Инфо
                top_icon_info: webix.$$('dvt:icon:info')
                // Шаблон онлайн/оффлайн
                ,top_tpl_offline: webix.$$('dvt:tpl:offline')
                // Кнопка списка сообщений и статусов
                ,top_icon_statuses: webix.$$('dvt:icon:statuses')
                // Меню и шаблон режимов
                ,mode_select: webix.$$('dvt:rs:mode')
                ,label_mode: webix.$$('dvt:lbl:mode')
                // Шаблон Armed
                ,label_armed: webix.$$('dvt:lbl:armed')
                // Кнопки ARM, DISARM
                ,arm_btn: webix.$$('dvt:btn:arm')
                ,disarm_btn: webix.$$('dvt:btn:disarm')
                // Кнопки управления режимами
                ,btn_guided: webix.$$('dvt:btn:md_guided')
                ,btn_cm_loiter: webix.$$('dvt:btn:cm_loiter')
                ,takeoff_btn: webix.$$('dvt:btn:takeoff')
                ,land_btn: webix.$$('dvt:btn:land')
                ,rtl_btn: webix.$$('dvt:btn:rtl')
                // Кнопка Меню доп функций
                ,top_icon_actions: webix.$$('dvt:icon:actions')

                // Карта
                ,map: mapObj // Объект карты Google

                // Панель с видео, полетными индикаторами и джойстиками
                ,fi_popup: view.$scope.fi_popup
                ,horizon: view.$scope.fi_popup.queryView({localId: 'fi:horizon'})
                ,compass: view.$scope.fi_popup.queryView({localId: 'fi:compass'})

                // Панель виджетов телеметрии
                ,telem_top: view.$scope.telemetry_popup
                ,tw_map_center: view.$scope.telemetry_popup.queryView({localId: 'tw:mapCenter'})
                ,tw_alt: view.$scope.telemetry_popup.queryView({localId: 'tw:alt'})
                ,tw_speed: view.$scope.telemetry_popup.queryView({localId: 'tw:speed'})
                ,tw_sats: view.$scope.telemetry_popup.queryView({localId: 'tw:sats'})
                ,tw_bat_v: view.$scope.telemetry_popup.queryView({localId: 'tw:bat_v'})
                ,tw_dist_home: view.$scope.telemetry_popup.queryView({localId: 'tw:dist_home'})


                //
                // Всплывающие окна и их элементы

                // Шаблон информации
                ,popup_info_tpl: view.$scope.info_popup.queryView({localId: 'tpl:info'})
                ,drone_udp_switch: view.$scope.info_popup.queryView({localId: 'sw:drone_udp'})
                ,drone_udp_info: view.$scope.info_popup.queryView({localId: 'tpl:info_udp'})
                ,gcs_tcp_switch: view.$scope.info_popup.queryView({localId: 'sw:gcs_tcp'})
                ,gcs_tcp_info: view.$scope.info_popup.queryView({localId: 'tpl:info_tcp'})

                // Список статусов
                ,statuses_list: view.$scope.statuses_popup.queryView({localId: 'list:statuses'})

                // Action menu
                ,action_menu_popup: view.$scope.action_menu
                ,slider_servo5: view.$scope.action_menu.queryView({localId: 'sw:ser5'})
                ,slider_servo6: view.$scope.action_menu.queryView({localId: 'sw:ser6'})
                ,sw_servo7: view.$scope.action_menu.queryView({localId: 'sw:ser7'})
                ,sw_servo8: view.$scope.action_menu.queryView({localId: 'sw:ser8'})
                ,btn_logs_list: view.$scope.action_menu.queryView({localId: 'btn:get_logs_list'})
                ,btn_params_list: view.$scope.action_menu.queryView({localId: 'btn:params_list'})
                ,get_mission_button: view.$scope.action_menu.queryView({localId: 'btn:get_mission'})
                // Выключатели реле
                ,relay1_switch: view.$scope.action_menu.queryView({localId: 'sw:rel1'})
                ,relay2_switch: view.$scope.action_menu.queryView({localId: 'sw:rel2'})
                ,relay3_switch: view.$scope.action_menu.queryView({localId: 'sw:rel3'})
                ,relay4_switch: view.$scope.action_menu.queryView({localId: 'sw:rel4'})

                // Takeoff
                ,takeoff_popup: view.$scope.takeoff_popup
                ,takeoff_alt: view.$scope.takeoff_popup.queryView({localId: 'fld:alt'})
                ,takeoff_confirm: view.$scope.takeoff_popup.queryView({localId: 'btn:takeoff'})

                // Log download
                ,log_dl_popup: view.$scope.log_dl_popup
                ,log_dl_msg: view.$scope.log_dl_popup.queryView({localId: 'tpl:log_msg'})
                ,log_dl_stop: view.$scope.log_dl_popup.queryView({localId: 'btn:stop'})
                ,log_dl_view: view.$scope.log_dl_popup.queryView({localId: 'btn:view'})
                ,log_dl_close: view.$scope.log_dl_popup.queryView({localId: 'btn:close'})

                // Logs list
                ,logs_list_popup: view.$scope.logs_list_popup
                ,logs_list_table: view.$scope.logs_list_popup.queryView({localId: 'dtb:logs_list'})
                ,logs_list_erase: view.$scope.logs_list_popup.queryView({localId: 'btn:erase'})
                ,logs_list_refresh: view.$scope.logs_list_popup.queryView({localId: 'btn:refresh'})

                // Params List
                ,params_list_popup: view.$scope.params_list_popup
                ,params_list_tab: view.$scope.params_list_popup.queryView({localId: 'tb:params_tab'})
                ,params_list_table: view.$scope.params_list_popup.queryView({localId: 'dtb:params_list'})
                ,params_list_table_save: view.$scope.params_list_popup.queryView({localId: 'dtb:params_list_save'})
                ,params_list_save: view.$scope.params_list_popup.queryView({localId: 'btn:save'})

                // Переключатель источника видео
                ,video_switch: view.$scope.fi_popup.queryView({localId: 'switch:video_src'})

                // Джойстики
                ,joystick_left: view.$scope.fi_popup.queryView({j_id: 'j_left'})
                ,joystick_right: view.$scope.fi_popup.queryView({j_id: 'j_right'})
                ,joystick_gimbal: view.$scope.fi_popup.queryView({j_id: 'j_gimb'})

            };
            //
            //

            // Привязка маркера к карте
            _this.drone_marker.setMap(_this.view_els.map);

            // Привязка пути к карте
            _this.flight_path.setMap(_this.view_els.map);

            // Обработка кликов на карте
            _this.mapClickListener = _this.view_els.map.addListener('click', _this.mapClickHandler);


            // Если установлен тип и доступны режимы
            if( _this.drone_data.modes && _this.drone_data.modes.length ){
                // Загрузим их в меню
                _this.view_els.mode_select.getList().parse(_this.drone_data.modes);
            }


            //
            //  Отобразить данные на экране
            //

            // Привязка компаса и горизонта к данным
            _this.view_els.horizon.bind(_this.drone_data.telem_10hz);
            _this.view_els.compass.bind(_this.drone_data.telem_10hz);

            // Данные и состояние виджетов телеметрии
            _this.view_els.tw_alt.parseValue = function(value){
                let alt = parseFloat(value);
                if( isNaN(alt) ) return "??";

                return alt < 10 && alt > -10 ? alt.toFixed(1) : Math.round(alt)+"";
            };
            _this.view_els.tw_sats.parseValue = function(value){
                let sats = parseInt(value);

                if( isNaN(sats) || sats < 6 ) this.setState('danger');
                else if( sats < 10 ) this.setState('warn');
                else this.setState('normal');

                return value;
            };
            _this.view_els.tw_dist_home.parseValue = function(value){
                let dist = parseInt(value); // comes in rounded meters

                if( isNaN(dist) ) return "??";

                if( dist < 1000 ){
                    this.setLabel('m');
                    return dist;
                }
                else {
                    this.setLabel('km');
                    let dist_km = dist/1000;
                    if( dist_km < 10 ){
                        return dist_km.toFixed(2);
                    }
                    else if( dist_km < 100 ){
                        return dist_km.toFixed(1);
                    }
                    else return Math.round(dist_km);
                }
            };

            // Привязка виджетов телеметрии к данным
            _this.view_els.tw_alt.connectDataRecord(_this.drone_data.telem_1hz, "alt");
            _this.view_els.tw_speed.connectDataRecord(_this.drone_data.telem_1hz, "gps_speed");
            _this.view_els.tw_sats.connectDataRecord(_this.drone_data.telem_1hz, "sats");
            _this.view_els.tw_bat_v.connectDataRecord(_this.drone_data.telem_1hz, "bat_v");
            _this.view_els.tw_dist_home.connectDataRecord(_this.drone_data.telem_1hz, "dist_home");


            // Привязка списка статусов
            _this.view_els.statuses_list.data.sync(_this.drone_data.statuses_collection);

            // Привязка шаблона информации
            _this.view_els.popup_info_tpl.bind(_this.drone_data.info.record());
            _this.view_els.drone_udp_info.bind(_this.drone_data.info.record());
            _this.view_els.gcs_tcp_info.bind(_this.drone_data.info.record());


            //
            //  Обработка событий
            //

            // Кнопка Mode Guided
            _this.view_els.btn_guided.attachEvent('onItemClick', () => {

                _this.command('md_guided', {})
                    .then( result => {
                        Message.info('Mode GUIDED');
                    })
                    .catch( err => {
                        Message.error('Failed to set mode: ' + err);
                    });

            });

            // Кнопка Command Loiter Unlimited
            _this.view_els.btn_cm_loiter.attachEvent('onItemClick', () => {

                _this.command('cm_loiter', {})
                    .then( result => {
                        Message.info('Command set');
                    })
                    .catch( err => {
                        Message.error('Failed to set mode: ' + err);
                    });

            });

            // Кнопка Взлет
            _this.view_els.takeoff_btn.attachEvent('onItemClick', () => {
                _this.view_els.takeoff_popup.show();
            });

            // Подтверждение взлета
            _this.view_els.takeoff_confirm.attachEvent('onItemClick', () => {
                let alt = _this.view_els.takeoff_alt.getValue();
                if( !alt ) alt = 1;

                _this.command('takeoff', {alt: alt})
                    .then( result => {
                        Message.info('Taking off at ' + alt);
                    })
                    .catch( err => {
                        Message.error('Takeoff command failed: ' + err);
                    });

                _this.view_els.takeoff_popup.hide();
            });

            // Кнопка Посадка
            _this.view_els.land_btn.attachEvent('onItemClick', () => {

                _this.command('land', {})
                    .then( result => {
                        Message.info('Landing');
                    })
                    .catch( err => {
                        Message.error('Land command failed: ' + err);
                    });

            });

            // Кнопка RTL
            _this.view_els.rtl_btn.attachEvent('onItemClick', () => {

                _this.command('rtl', {})
                    .then( result => {
                        Message.info('Returning home');
                    })
                    .catch( err => {
                        Message.error('RTL command failed: ' + err);
                    });

            });

            // Переключение полетных режимов
            _this.view_els.mode_select.attachEvent('onChange', function(new_value, old_value){
                _this.view_els.mode_select.disable();

                console.log("SET MODE Source 1");
                _this.command('set_mode', {
                    mode: new_value
                }).then(function(res){

                    setTimeout(function() {
                        _this.view_els.mode_select.enable();
                    }, 1100);

                }).catch(function(res){

                    Message.error('Failed to set mode: ' + res);

                    _this.view_els.mode_select.blockEvent();
                    _this.view_els.mode_select.setValue(old_value);
                    _this.view_els.mode_select.unblockEvent();

                    setTimeout(function() {
                        _this.view_els.mode_select.enable();
                    }, 1500);

                });
            });

            // Кнопка ARM
            _this.view_els.arm_btn.attachEvent('onItemClick', function(){

                webix.confirm({
                    ok: "ARM",
                    cancel: "Cancel",
                    text: "Confirm ARM?",
                    callback: function (result) { //setting callback
                        if( !result ) return;

                        _this.view_els.arm_btn.disable();

                        _this.command('arm', {arm: 1}).then(function(res){

                            if( 'success' === res ){
                                Message.info('Drone ARMED');
                            }
                            else {
                                Message.info('Command pending...');
                            }
                            _this.view_els.arm_btn.enable();

                        }).catch(function(err){

                            Message.error('Failed to ARM: ' + err);

                            _this.view_els.arm_btn.enable();

                        });
                    }
                });

            });

            // Кнопка DISARM
            _this.view_els.disarm_btn.attachEvent('onItemClick', function(){
                webix.confirm({
                    ok: "DISARM",
                    cancel: "Cancel",
                    text: "Confirm DISARM?",
                    callback: function (result) { //setting callback
                        if( !result ) return;

                        _this.view_els.disarm_btn.disable();

                        _this.command('arm', {arm: 0}).then(function(res){

                            if( 'success' === res ){
                                Message.info('Drone DISARMED');
                            }
                            else {
                                Message.info('Command pending...');
                            }
                            _this.view_els.disarm_btn.enable();

                        }).catch(function(err){

                            Message.error('Failed to DISARM: ' + err);

                            _this.view_els.disarm_btn.enable();

                        });
                    }
                });

            });

            // Кнопка в виджетах телеметрии для центрирования карты
            _this.view_els.tw_map_center.attachEvent('onItemClick', () => {

                if( "active" === _this.view_els.tw_map_center.getState() ){
                    _this.view_els.tw_map_center.setState("normal");
                    _this.drone_marker.mapAutoCenter(false);
                }
                else {
                    _this.view_els.tw_map_center.setState("active");
                    _this.drone_marker.mapAutoCenter(true);
                }

            });
            // Виджет дистанция до точки старта. Клик центрирует на карте точку старта
            _this.view_els.tw_dist_home.attachEvent("onItemClick", () => {
                if( _this.home_marker.getPosition() ){
                    _this.drone_marker.mapAutoCenter(false);
                    _this.view_els.tw_map_center.setState("normal");
                    _this.view_els.map.panTo(_this.home_marker.getPosition());
                }
                else {
                    Message.error('No Home position');
                }
            });

            // Кнопка Загрузить миссию с борта
            _this.view_els.get_mission_button.attachEvent('onItemClick', function(){
                _this.view_els.get_mission_button.disable();
                _this.command('get_mission').then(function(res){
                    Message.info('Get mission: ' + res);
                    _this.view_els.get_mission_button.enable();
                }).catch(function(res){
                    if( 'rejected' === res ){
                        Message.error('No mission onboard');
                        _this.mission.clear();
                    }
                    else {
                        Message.error('Mission download FAILED: ' + res);
                    }

                    _this.view_els.get_mission_button.enable();
                });
            });

            // Управление серво
            _this.view_els.slider_servo5.attachEvent('onChange', value => {
                _this.command('set_servo', {servo: 5, value: value})
                    .then(function(res){

                    })
                    .catch(function(err){
                        Message.error('Failed to set servo: ' + err);
                    });
            });
            _this.view_els.slider_servo6.attachEvent('onChange', value => {
                _this.command('set_servo', {servo: 6, value: value})
                    .then(function(res){

                    })
                    .catch(function(err){
                        Message.error('Failed to set servo: ' + err);
                    });
            });
            _this.view_els.sw_servo7.attachEvent('onChange', value => {
                _this.command('set_servo', {servo: 7, sw: value})
                    .then(function(res){

                    })
                    .catch(function(err){
                        Message.error('Failed to set servo: ' + err);
                    });
            });
            _this.view_els.sw_servo8.attachEvent('onChange', value => {
                _this.command('set_servo', {servo: 8, sw: value})
                    .then(function(res){

                    })
                    .catch(function(err){
                        Message.error('Failed to set servo: ' + err);
                    });
            });

            // Переключатели Реле
            _this.view_els.relay1_switch.attachEvent('onChange', (value, old_value) => {

                _this.view_els.relay1_switch.disable();

                let switch_position = value ? 'on' : 'off';

                _this.command('switch_relay', {relay: 1, switch: switch_position}).then(function(res){
                    if( 'success' === res ){
                        _this.view_els.relay1_switch.enable();
                        Message.info('Relay 1 switched ' + switch_position.toUpperCase());
                    }
                }).catch(function(err){
                    _this.view_els.relay1_switch.blockEvent();
                    _this.view_els.relay1_switch.setValue(old_value);
                    _this.view_els.relay1_switch.unblockEvent();
                    _this.view_els.relay1_switch.enable();
                    Message.error('Failed to switch Relay 1: ' + err);
                });

            });
            _this.view_els.relay2_switch.attachEvent('onChange', (value, old_value) => {

                _this.view_els.relay2_switch.disable();

                let switch_position = value ? 'on' : 'off';

                _this.command('switch_relay', {relay: 2, switch: value ? 'on' : 'off'}).then(function(res){
                    if( 'success' === res ){
                        _this.view_els.relay2_switch.enable();
                        Message.info('Relay 2 switched ' + switch_position.toUpperCase());
                    }
                }).catch(function(err){
                    _this.view_els.relay2_switch.blockEvent();
                    _this.view_els.relay2_switch.setValue(old_value);
                    _this.view_els.relay2_switch.unblockEvent();
                    _this.view_els.relay2_switch.enable();
                    Message.error('Failed to switch Relay 2: ' + err);
                });

            });
            _this.view_els.relay3_switch.attachEvent('onChange', (value, old_value) => {

                _this.view_els.relay3_switch.disable();

                let switch_position = value ? 'on' : 'off';

                _this.command('switch_relay', {relay: 3, switch: value ? 'on' : 'off'}).then(function(res){
                    if( 'success' === res ){
                        _this.view_els.relay3_switch.enable();
                        Message.info('Relay 3 switched ' + switch_position.toUpperCase());
                    }
                }).catch(function(err){
                    _this.view_els.relay3_switch.blockEvent();
                    _this.view_els.relay3_switch.setValue(old_value);
                    _this.view_els.relay3_switch.unblockEvent();
                    _this.view_els.relay3_switch.enable();
                    Message.error('Failed to switch Relay 3: ' + err);
                });

            });
            _this.view_els.relay4_switch.attachEvent('onChange', (value, old_value) => {

                _this.view_els.relay4_switch.disable();

                let switch_position = value ? 'on' : 'off';

                _this.command('switch_relay', {relay: 4, switch: value ? 'on' : 'off'}).then(function(res){
                    if( 'success' === res ){
                        _this.view_els.relay4_switch.enable();
                        Message.info('Relay 4 switched ' + switch_position.toUpperCase());
                    }
                }).catch(function(err){
                    _this.view_els.relay4_switch.blockEvent();
                    _this.view_els.relay4_switch.setValue(old_value);
                    _this.view_els.relay4_switch.unblockEvent();
                    _this.view_els.relay4_switch.enable();
                    Message.error('Failed to switch Relay 4: ' + err);
                });

            });

            // Запуск/остановка UDP сервера
            _this.view_els.drone_udp_switch.setValue( parseInt(_this.drone_data.info.get('udp_ip_s')) === 1 ? 1 : 0);
            _this.view_els.drone_udp_switch.attachEvent('onChange', function(value, old_value) {

                const sw = this;

                sw.disable();

                if( parseInt(value) === 1 ){
                    // Запустить UDP
                    _this.drone_data.info.set({udp_ip_c: 'starting...'});

                    _this.RPC('startUDP')
                        .then( result => {
                            Message.info('UDP server started');
                            sw.enable();
                        })
                        .catch(function(err){
                            Message.error('Failed to start UDP server: ' + err);
                            _this.drone_data.info.set({udp_ip_c: 'failed to start'});
                            sw.blockEvent();
                            sw.setValue(0);
                            sw.unblockEvent();
                            sw.enable();
                        });
                }
                else {
                    // Остановить UDP

                    webix.confirm({
                        ok: "Stop UDP",
                        cancel: "Cancel",
                        text: "Stop UDP server for this drone?",
                        callback: function(result) { //setting callback
                            if (!result) {
                                sw.blockEvent();
                                sw.setValue(1);
                                sw.unblockEvent();
                                sw.enable();
                                return;
                            }

                            _this.drone_data.info.set({udp_ip_c: 'stopping...'});
                            _this.RPC('stopUDP')
                                .then( result => {
                                    Message.info('UDP server stopped');
                                    sw.enable();
                                })
                                .catch(function (err) {
                                    Message.error('Failed to stop UDP server: ' + err);
                                    _this.drone_data.info.set({udp_ip_c: 'failed to stop'});
                                    sw.blockEvent();
                                    sw.setValue(1);
                                    sw.unblockEvent();
                                    sw.enable();
                                });


                        }
                    });
                }
            });

            // Запуск/остановка TCP сервера
            _this.view_els.gcs_tcp_switch.setValue( parseInt(_this.drone_data.info.get('tcp_op_s')) === 1 ? 1 : 0);
            _this.view_els.gcs_tcp_switch.attachEvent('onChange', function(value, old_value) {
                const sw = this;

                sw.disable();

                if( parseInt(value) === 1 ){
                    // Запустить TCP
                    _this.drone_data.info.set({tcp_op_c: 'starting...'});

                    _this.RPC('startGCSTCP')
                        .then( result => {
                            Message.info('TCP server started: '+ result);
                            sw.enable();
                        })
                        .catch(function(err){
                            Message.error('Failed to start TCP server: ' + err);
                            _this.drone_data.info.set({tcp_op_c: 'failed to start'});
                            sw.blockEvent();
                            sw.setValue(0);
                            sw.unblockEvent();
                            sw.enable();
                        });
                }
                else {
                    // Остановить TCP

                    webix.confirm({
                        ok: "Stop TCP",
                        cancel: "Cancel",
                        text: "Stop TCP server for this drone?",
                        callback: function(result) { //setting callback
                            if (!result) {
                                sw.blockEvent();
                                sw.setValue(1);
                                sw.unblockEvent();
                                sw.enable();
                                return;
                            }

                            _this.drone_data.info.set({tcp_op_c: 'stopping...'});
                            _this.RPC('stopGCSTCP')
                                .then( result => {
                                    Message.info('TCP server stopped: ' + result);
                                    sw.enable();
                                })
                                .catch(function (err) {
                                    Message.error('Failed to stop TCP server: ' + err);
                                    _this.drone_data.info.set({tcp_op_c: 'failed to stop'});
                                    sw.blockEvent();
                                    sw.setValue(1);
                                    sw.unblockEvent();
                                    sw.enable();
                                });
                        }
                    });
                }
            });

            // Джойстики
            _this.view_els.joystick_left.setController( _this.drone.joystick.set_left );
            _this.view_els.joystick_right.setController( _this.drone.joystick.set_right );

            // Кнопка открыть список логов
            _this.view_els.btn_logs_list.attachEvent('onItemClick', () => {
                _this.view_els.logs_list_popup.show();
                _this.view_els.action_menu_popup.hide();

                _this.view_els.logs_list_table.clearAll();
                _this.view_els.logs_list_table.showOverlay('Loading...');

                _this.view_els.log_dl_popup.hide();

                _this.RPC('getBoardLogs', {})
                    .then(function(result){
                        _this.view_els.logs_list_table.parse(result);
                        if( _this.view_els.logs_list_table.count() ){
                            _this.view_els.logs_list_table.hideOverlay();
                        }
                        else {
                            _this.view_els.logs_list_table.showOverlay('Logs list is empty');
                        }
                    })
                    .catch(function(err){
                        Message.error('Failed to load logs: ' + err);
                    });
            });

            // Кнопка очистить логи на борте
            _this.view_els.logs_list_erase.attachEvent('onItemClick', () => {
                webix.confirm({
                    ok: "ERASE",
                    cancel: "Cancel",
                    text: "Erase ALL board logs?",
                    callback: function (result) { //setting callback
                        if( !result ) return;

                        _this.RPC('eraseBoardLogs', {})
                            .then(function(result){
                                Message.info('Logs erased');
                                _this.view_els.logs_list_table.clearAll();
                            })
                            .catch(function(err){
                                Message.error('Failed to erase logs ' + err);
                            });

                    }
                });
            });

            // Кнопка Обновить логи с борта
            _this.view_els.logs_list_refresh.attachEvent('onItemClick', () => {
                _this.view_els.logs_list_table.clearAll();

                _this.view_els.logs_list_table.showOverlay('Loading...');

                _this.RPC('getBoardLogs', {})
                    .then(function(result){
                        _this.view_els.logs_list_table.parse(result);
                        if( _this.view_els.logs_list_table.count() ){
                            _this.view_els.logs_list_table.hideOverlay();
                        }
                        else {
                            _this.view_els.logs_list_table.showOverlay('Logs list is empty');
                        }
                    })
                    .catch(function(err){
                        Message.error('Failed to load logs: ' + err);
                    });
            });

            // Клики на списке лог файлов
            // Показать лог
            _this.view_els.logs_list_table.attachEvent('clickOnView', log_id => {
                let item = _this.view_els.logs_list_table.getItem(log_id);
                if( !item ) return;

                _this.view.$scope.show('dataflash_log_view?id=' + item.log_id);
            });
            // Загрузить лог
            _this.view_els.logs_list_table.attachEvent('clickOnDL', log_id => {
                _this.RPC('downloadBoardLog', log_id)
                    .then(function(result){
                        let log_item = _this.view_els.logs_list_table.getItem(log_id);
                        if( !log_item ) return;
                        if( 'queued' === result ){
                            log_item.s = 'q';
                        }
                        else if( 'started' === result ){
                            log_item.s = 'dl';
                            log_item.dp = 0;
                        }
                        _this.view_els.logs_list_table.updateItem(log_id, log_item);

                    })
                    .catch(function(err){
                        Message.error('Failed to load log: ' + err);
                    });
            });
            // Отменить загрузку лога
            _this.view_els.logs_list_table.attachEvent('clickOnCancel', log_id => {
                _this.RPC('logDLCancel', log_id)
                    .then(function(result){
                        let log_item = _this.view_els.logs_list_table.getItem(log_id);
                        if( !log_item ) return;

                        log_item.s = 0;
                        _this.view_els.logs_list_table.updateItem(log_id, log_item);

                    })
                    .catch(function(err){
                        Message.error('Failed to cancel: ' + err);
                    });
            });
            // Отменить ожидание загрузки лога
            _this.view_els.logs_list_table.attachEvent('clickOnCancelQ', log_id => {
                _this.RPC('logDLCancelQ', log_id)
                    .then(function(result){
                        let log_item = _this.view_els.logs_list_table.getItem(log_id);
                        if( !log_item ) return;

                        log_item.s = 0;
                        _this.view_els.logs_list_table.updateItem(log_id, log_item);

                    })
                    .catch(function(err){
                        Message.error('Failed to load log: ' + err);
                    });
            });

            // Остановка загрузки лога
            _this.view_els.log_dl_stop.attachEvent('onItemClick', () => {
                webix.confirm({
                    ok: "STOP",
                    cancel: "Cancel",
                    text: "Stop downloading?",
                    callback: function (result) { //setting callback
                        if( !result ) return;

                        _this.RPC('logDLCancel', 0)
                            .then(function(result){
                                _this.view_els.log_dl_stop.hide();
                                _this.view_els.log_dl_close.show();
                                setTimeout( () => {
                                    _this.view_els.log_dl_popup.hide();
                                }, 1000);

                            })
                            .catch(function(err){
                                Message.error('Failed to cancel: ' + err);
                            });
                    }
                });
            });

            // Открыть лог
            _this.view_els.log_dl_view.attachEvent('onItemClick', () => {
                if( _this.drone_data.latest_log_id ) _this.view.$scope.show('dataflash_log_view?id=' + _this.drone_data.latest_log_id);
            });

            // Открыть окно с параметрами
            _this.view_els.btn_params_list.attachEvent('onItemClick', () => {
                _this.view_els.params_list_popup.show();
                _this.view_els.action_menu_popup.hide();
                _this.view_els.params_list_save.enable();

                _this.view_els.params_list_table.clearAll();
                _this.view_els.params_list_table_save.clearAll();
                _this.view_els.params_list_table.showOverlay('Loading...');

                let save_tab = _this.view_els.params_list_tab.getOption('params_save');
                save_tab.value = 'Unsaved (0)';
                _this.view_els.params_list_tab.refresh();

                _this.RPC('getBoardParams', {})
                    .then(function(result){
                        if( !result.length ){
                            _this.view_els.params_list_table.showOverlay('No data');
                        }
                        else {
                            _this.view_els.params_list_table.hideOverlay();
                            _this.view_els.params_list_table.parse(result);
                            _this.view_els.params_list_table.sort('id');
                        }
                    })
                    .catch(function(err){
                        Message.error('Failed to load params list: ' + err);
                        _this.view_els.params_list_table.showOverlay('Failed to get data');
                    });
            });

            // Редактирование параметров
            _this.view_els.params_list_table.attachEvent('onAfterEditStop', (state, editor) => {
                if( state.old == state.value ) return;

                let item_to_save = _this.view_els.params_list_table_save.getItem(editor.row);

                // Если в списке измененных значений его нет, то добавить
                if( !item_to_save ) _this.view_els.params_list_table_save.add({id: editor.row, o_val: state.old, n_val: state.value});

                // Если есть и значение вернули к старому, то удалить
                else if( item_to_save.o_val == state.value ) _this.view_els.params_list_table_save.remove(editor.row);

                // Если есть и значение другое, то изменить
                else _this.view_els.params_list_table_save.updateItem(editor.row, {n_val: state.value});

                let save_tab = _this.view_els.params_list_tab.getOption('params_save');
                save_tab.value = 'Unsaved (' + _this.view_els.params_list_table_save.count() + ')';
                _this.view_els.params_list_tab.refresh();

            });

            // Удаление редактированного параметра из списка на сохранение
            _this.view_els.params_list_table_save.attachEvent('clickCancel', id => {
                let old_val =_this.view_els.params_list_table_save.getItem(id).o_val;

                _this.view_els.params_list_table.updateItem(id, {val: old_val});
                _this.view_els.params_list_table_save.remove(id);

                let save_tab = _this.view_els.params_list_tab.getOption('params_save');
                save_tab.value = 'Unsaved (' + _this.view_els.params_list_table_save.count() + ')';
                _this.view_els.params_list_tab.refresh();
            });

            // Сохранение новых параметров на борт
            _this.view_els.params_list_save.attachEvent('onItemClick', () => {
                _this.view_els.params_list_tab.setValue('params_save');

                let changed_params = _this.view_els.params_list_table_save.count();

                if( !changed_params ) return webix.alert('Nothing to save');

                webix.confirm({
                    ok: "SAVE",
                    cancel: "Cancel",
                    text: `Confirm changing ${changed_params} parameter${changed_params>1?'s':''}?`,
                    callback: function (result) {
                        if( !result ) return;

                        _this.view_els.params_list_save.disable();

                        let params_to_save = [];
                        _this.view_els.params_list_table_save.eachRow( row_id => {
                            let row = _this.view_els.params_list_table_save.getItem(row_id);
                            params_to_save.push({id: row.id, val: row.n_val});
                        });

                        _this.RPC('saveBoardParams', params_to_save)
                            .then(function(result){
                                Message.info('Params saved');
                                _this.view_els.params_list_table_save.clearAll();
                                let save_tab = _this.view_els.params_list_tab.getOption('params_save');
                                save_tab.value = 'Unsaved (0)';
                                _this.view_els.params_list_tab.refresh();
                                _this.view_els.params_list_save.enable();
                            })
                            .catch(function(err){
                                Message.error('Failed to save params: ' + err);
                                _this.view_els.params_list_save.enable();
                            });

                    }
                });
            });

            // переключатель видеоканалов
            _this.view_els.video_switch.attachEvent('onChange', value => {
                if( !_this.drone_data.params['video_stream_' + value] ) return Message.info('Video stream ' + value + ' is not set');

                _this.videoURL = _this.drone_data.params['video_stream_' + value];
                _this.initVideoPlayer();

            });

            // Видео плеер
            if( _this.drone_data.params.video_stream_1 && _this.drone_data.params.video_stream_1.trim().length > 10 ) _this.videoURL = _this.drone_data.params.video_stream_1.trim();
            else if( _this.drone_data.params.video_stream_2 && _this.drone_data.params.video_stream_2.trim().length > 10 ) _this.videoURL = _this.drone_data.params.video_stream_2.trim();
            else if( _this.drone_data.params.video_stream_3 && _this.drone_data.params.video_stream_3.trim().length > 10 ) _this.videoURL = _this.drone_data.params.video_stream_3.trim();
            if( _this.videoURL ) _this.initVideoPlayer();

            //
            //   Установка вида онлайн или оффлайн
            _this.drone.isOnline() ?  _this.view_online() : _this.view_offline();


            console.log("MAVDrone view_start end");

        });

    }


    //
    // Свернуть вид и его обновление
    view_stop(){
        console.log("MAVDrone view_stop begin");
        try {
            this.heartbeat.stop();
            this.drone_marker.setMap(null);

            if( !this.view_enabled ) return;

            // Удалить обработчик кликов с карты
            if( this.mapClickListener ) {
                this.mapClickListener.remove();
                this.mapClickListener = null;
            }

            if( this.home_marker ) this.home_marker.setMap(null);
            this.flight_path.setMap(null);
            this.destination_path.hide();
            this.mission.hide();


            if( this.player ){
                this.player.destroy();
                this.player = null;
            }

            if( this.view && this.view.$scope ){
                this.view.$scope.info_popup.queryView({localId: 'tpl:info'}).unbind();
            }

            // В самом конце
            this.view_enabled = false;
            this.view_els = {};
        }
        catch (e) {
            console.log(e);
        }
        console.log("MAVDrone view_stop end");
    }


    //
    // Загрузить полетный план на борт
    uploadFlightPlan(fp_id, progress_view){

        const _this = this;

        let upload_timeout = null;

        return new Promise(function(resolve, reject){
            if( 'online' !== _this.drone.item.status ){
                reject('Drone gone offline');
                return ;
            }

            // Отключим старые обработчики
            _this.socket.off('fp_upl_progress_' + _this.drone.id);

            // Включим новый обработчик процесса загрузки
            _this.socket.on('fp_upl_progress_' + _this.drone.id, value => {
                console.log(value);

                // Сбрасываем таймаут ожидания
                if( upload_timeout ) clearTimeout(upload_timeout);
                else {
                    _this.socket.off('fp_upl_progress_' + _this.drone.id);
                    return;
                }

                // План не загружен
                if( isNaN(value) ){
                    reject(value);
                    upload_timeout = null;
                    _this.socket.off('fp_upl_progress_' + _this.drone.id);
                    return;
                }

                if( progress_view && progress_view.isVisible() ) progress_view.setValues({progress: parseInt(value)});

                // Если план полностью загрузился, включим успех
                if( value >= 100 ){
                    resolve();
                    upload_timeout = null;
                    _this.socket.off('fp_upl_progress_' + _this.drone.id);
                    return;
                }

                // А если еще не 100%, то подождем еще
                upload_timeout = setTimeout(function(){
                    reject('Item timeout');
                    upload_timeout = null;
                }, 15000);
            });

            // Отправим команду на сервер, чтобы загрузить план на борт
            _this.command('upload_fp', {fp_id: fp_id});

            // Включим таймаут
            upload_timeout = setTimeout(function(){
                _this.socket.off('fp_upl_progress_' + _this.drone.id);
                reject('timeout');
            }, 10000);

        });
    }


    //
    // Удалить дрон
    remove(){
        this.view_stop();

        if( this.check_online_interval ) clearInterval(this.check_online_interval);
        if( this.ping_interval ) clearInterval(this.ping_interval);

        this.socket.off('telem_10hz_' + this.drone.id);
        this.socket.off('telem_1hz_' + this.drone.id);
        this.socket.off('status_text_' + this.drone.id);
        this.socket.off('info_' + this.drone.id);
        this.socket.off('com_ack_' + this.drone.id);
        this.socket.off('ping_' + this.drone.id);

    }


}

export default MAVDroneClient;
