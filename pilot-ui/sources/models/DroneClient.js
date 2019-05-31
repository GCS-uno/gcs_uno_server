"use strict";

import helpers from '../../../utils/helpers';
import Message from '../plugins/Message';
import DronesCollection from './DronesCollection';
import {telem1_fields, telem10_fields} from '../../../defs/io_telemetry_fields';


const STATUSES_LIST_LIMIT = 50;

// Параметры маркера на карте
const marker_icon_params = {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW
    ,scale: 5
    ,strokeColor: '#160e01'
    ,fillColor: '#eede00'
    ,fillOpacity: 1.0
    ,strokeWeight: 3
    ,rotation: 180
};

const home_marker_icon_params = {
    path: google.maps.SymbolPath.CIRCLE
    ,scale: 11
    ,fillColor: '#000000'
    ,fillOpacity: 0.8
    ,strokeColor: '#ffbd4d'
    ,strokeWeight: 2
    ,zIndex: 2000
};

const go_here_marker_icon = {
    path: google.maps.SymbolPath.CIRCLE
    ,scale: 11
    ,fillColor: '#ffbd4d'
    ,fillOpacity: 1.0
    ,strokeColor: '#000000'
    ,strokeWeight: 2
    ,zIndex: 2000
};

function GoHereMenu() {
    this.div_ = document.createElement('div');
    this.div_.className = 'gohere-menu';
    this.div_.innerHTML = 'Go here';
    this.marker = new google.maps.Marker({
         zIndex: 2
        ,clickable: true
        ,crossOnDrag: true
    });
    this.marker.setIcon(go_here_marker_icon);

    google.maps.event.addDomListener(this.div_, 'click', () => {
        const position = this.get('position');
        this.gohere(position.lat(), position.lng());
    });
}
GoHereMenu.prototype = new google.maps.OverlayView();

GoHereMenu.prototype.draw = function() {
    const position = this.get('position');
    const projection = this.getProjection();

    if (!position || !projection)  return;

    const point = projection.fromLatLngToDivPixel(position);
    this.div_.style.top = point.y + 'px';
    this.div_.style.left = point.x + 'px';
};

GoHereMenu.prototype.open = function(map, lat, lng) {
    const position = new google.maps.LatLng({lat: lat, lng: lng});
    this.set('position', position);
    this.setMap(map);
    this.draw();
    this.marker.setPosition(position);
    this.marker.setMap(map);
};

GoHereMenu.prototype.gohere = function(){};

GoHereMenu.prototype.onAdd = function() {
    const _this = this;
    this.getPanes().floatPane.appendChild(this.div_);

    // mousedown anywhere on the map except on the menu div will close the menu
    this.divListener_ = google.maps.event.addDomListener(this.getMap().getDiv(), 'mousedown', function(e) {
        if (e.target != _this.div_) {
            _this.close();
            return false;
        }
    }, true);
};

GoHereMenu.prototype.onRemove = function() {
    google.maps.event.removeListener(this.divListener_);
    this.div_.parentNode.removeChild(this.div_);
    this.set('position');
};

GoHereMenu.prototype.close = function() {
    this.setMap(null);
    this.marker.setMap(null);
};




/*

    Класс DroneClient

 */
class DroneClient {

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
                    ,set: function(values = {}){

                        let current_info = record.getValues();

                        //console.log(values);

                        // Проверить изменения, поставить оффлайн или онлайн
                        // Установка ОНЛАЙН или ОФФЛАЙН
                        if( values.hasOwnProperty('online') && parseInt(values.online) !== parseInt(current_info.online) ){
                            if( parseInt(values.online) === 1 ) _this.status_online();
                            else   _this.status_offline();
                        }

                        // Переключение выключателя Drone UDP Server
                        if( values.hasOwnProperty('udp_ip_s') && parseInt(values.udp_ip_s) !== parseInt(current_info.udp_ip_s) && _this.view_enabled ){
                            const sw = _this.view.$scope.info_popup.queryView({localId: 'sw:drone_udp'});
                            sw.blockEvent();
                            sw.setValue(parseInt(values.udp_ip_s));
                            sw.unblockEvent();
                        }

                        // Переключение выключателя GCS TCP Server
                        if( values.hasOwnProperty('tcp_op_s') && parseInt(values.tcp_op_s) !== parseInt(current_info.tcp_op_s) && _this.view_enabled ){
                            const sw = _this.view.$scope.info_popup.queryView({localId: 'sw:gcs_tcp'});
                            sw.blockEvent();
                            sw.setValue(parseInt(values.tcp_op_s));
                            sw.unblockEvent();
                        }

                        // Home position
                        if( values.hasOwnProperty('h_pos_lat') && values.hasOwnProperty('h_pos_lon') && values.h_pos_lat && values.h_pos_lon ){
                           _this.home_marker.setPosition({lat: parseFloat(values.h_pos_lat), lng: parseFloat(values.h_pos_lon)});

                           _this.mission.setHome(parseFloat(values.h_pos_lat), parseFloat(values.h_pos_lon));

                            if( _this.view_enabled && _this.view_els.map ){
                                _this.home_marker.setMap(_this.view_els.map);
                            }
                        }

                        //
                        // Запросить список полетных режимов если их нет или поменялся тип автопилота
                        // Если списка нет, а автопилот распознан
                        if( ( (!_this.drone_data.modes && current_info.at)
                                // или сохраненный тип автопилота не совпадает с новым в сообщении
                                || (_this.drone_data.modes && values.hasOwnProperty('at') && current_info.at !== values.at)
                                // или сохраненный тип рамы не совпадает с новым в сообщении
                                || (_this.drone_data.modes && values.hasOwnProperty('ft') && current_info.ft !== values.ft) )
                            // И дрон онлайн
                            && (parseInt(current_info.online) === 1 || parseInt(values.online) === 1 ) ){

                            _this.command('modes_list');
                        }

                        return record.setValues(values, true);

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

            // Joystick controller
            ,joystick: function(){

                 let jx = 0, jy = 0;

                 return {
                     get: function(){
                         return {x1: jx, y1: jy};
                     }
                     ,set: function(pos){
                         jx = Math.round(pos.x);
                         jy = Math.round(pos.y);
                     }
                 }
            }()

        };

        this.view = null;
        this.view_enabled = false;
        this.view_els = {};

        this.check_online_interval = null;
        this.ping_interval = null;

        this.player = null;

        //
        // Маркер на карте
        this.marker = new google.maps.Marker({
            position: { lat:0, lng:0 }
            ,icon: marker_icon_params
            ,zIndex: 100
        });

        // Маркер точки старта
        this.home_marker = new google.maps.Marker({
            position: { lat:0, lng:0 }
            ,icon: home_marker_icon_params
            ,label: {text: 'H', color: '#ffbd4d'}
            ,opacity: 0.8
            ,zIndex: 1
        });


        // Функция отрисовки и перемещения маркера
        // coords: {lat,lng}, heading
        this.set_marker_position = function(){
            let t = _this.drone_data.telem_1hz.getValues();

            // Обновляем положение маркера
            if( t.lat && t.lon ) _this.marker.setPosition({lat: t.lat, lng: t.lon});
            else Message.error('No position data');

            // Поворот маркера
            let t10 = _this.drone_data.telem_10hz.getValues();

            let heading = null;
            if( t10.y < 0 ) heading = 360 + t10.y;
            else heading = t10.y;

            if( heading ) marker_icon_params.rotation = heading;

            _this.marker.setIcon(marker_icon_params);

        };

        this.set_marker_rotation = function(){
            let t = _this.drone_data.telem_10hz.getValues();

            let heading = null;
            if( t.y < 0 ) heading = 360 + t.y;
            else heading = t.y;

            // Поворот маркера
            if( heading ) marker_icon_params.rotation = heading;
            _this.marker.setIcon(marker_icon_params);

        };

        this.set_marker_map = function(){
            if( !_this.view_enabled || !_this.view ) return;

            let t = _this.drone_data.telem_1hz.getValues();

            if( !_this.marker.getMap() && (t.lat && t.lon) ){
                _this.marker.setMap(_this.view_els.map);

                _this.view_els.map.panTo(_this.marker.getPosition());
                _this.view_els.map.setZoom(18);
            }

        };

        this.mapClickListener = null;

        const go_here_menu = new GoHereMenu();

        let ignore_next_click = false;
        go_here_menu.gohere = function(lat, lng){
            ignore_next_click = true;
            //Message.info('Go here ' + lat + ' - ' + lng);
            go_here_menu.close();

            _this.command('nav2p', {lat: lat, lng: lng});
        };

        this.mapClickHandler = function(event){
            if( ignore_next_click ){
                ignore_next_click = false;
                return;
            }

            if( parseInt(_this.drone_data.telem_1hz.getValues().armed) === 0 ) return;

            go_here_menu.open(_this.view_els.map, event.latLng.lat(), event.latLng.lng());
        };

        //
        // Отправка высокоуровневых команд для предобработки на сервере
        this.command = function(command, params){
            if( !params ) params = {};

            // Список команд для которых нужно ждать ответа
            const MAV_CMD = {
                // команды MAV_CMD
                 takeoff: 22
                ,land: 21
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
                        //console.log('COMMAND TIMEOUT', command);
                        reject('timeout');
                    };

                    // Если не будет получен ответ через обозначенное то вернуть ошибку таймаута
                    command_timeout = setTimeout(command_timeout_func, 5000);

                    // Включить ожидание ответа на команду
                    _this.command_ack.wait(MAV_CMD[command], function (result) {
                        //console.log('COMM ACK', command);
                        // MAV_RESULT
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

        //
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

        //
        // Отправка heartbeat и джойстика
        this.heartbeat = function(){

            let status = false; // false=stopped, true=started

            const intervals = {
                heartbeat: null
                ,joystick: null
            };

            const send_heartbeat = function(){
                _this.command('gcs_heartbeat', {});
            };

            const send_joystick = function(){
                if( _this.drone.isOnline() ){
                    let jd = _this.drone_data.joystick.get();
                    _this.command('joystick', jd);
                    _this.drone_data.telem_10hz.setValues(jd);
                }
            };

            return {
                start: function(){
                    status = true;
                    send_heartbeat();
                    if( intervals.heartbeat ) clearInterval(intervals.heartbeat);
                    intervals.heartbeat = setInterval(send_heartbeat, 1000);

                    if( !!_this.drone_data.params.joystick_enable ){
                        if( intervals.joystick ) clearInterval(intervals.joystick);
                        intervals.joystick = setInterval(send_joystick, 100);
                    }
                }
                ,stop: function(){
                    status = false;
                    if( intervals.heartbeat ) clearInterval(intervals.heartbeat);
                    if( intervals.joystick ) clearInterval(intervals.joystick);
                }
                ,status: function(){
                    return status;
                }
            }
        }();

        //
        // След
        this.flight_path = function(){
            // След
            let f_path = new google.maps.Polyline({
                path: [],
                geodesic: true,
                strokeColor: '#ff1500',
                strokeOpacity: 0.8,
                strokeWeight: 4,
                zIndex: 10
            });
            let last_point_lat = 0, last_point_lng = 0;

            return {
                addPoint: function(lat, lng){
                    // Если дрон дезактивирован, то ничего не делаем
                    if( !parseInt(_this.drone_data.telem_1hz.getValues().armed) ) return;

                    // Если линия пустая, то добавляем сразу две точки
                    if( !f_path.getPath().getLength() ) {
                        f_path.getPath().push(new google.maps.LatLng(lat, lng));
                        f_path.getPath().push(new google.maps.LatLng(lat, lng));
                    }
                    else {
                        // Добавляем новую точку в след, если разница в сумме координат > X
                        let diff = 1;
                        if( f_path.getPath().getLength() && !helpers.isNil(last_point_lng) && !helpers.isNil(last_point_lat) ) diff = Math.abs((Math.abs(lat)+Math.abs(lng))-(Math.abs(last_point_lat)+Math.abs(last_point_lng)));
                        if( diff >= 0.00005 ){ // X
                            f_path.getPath().push(new google.maps.LatLng(lat, lng));
                            last_point_lat = lat;
                            last_point_lng = lng;
                        }
                        else {
                            f_path.getPath().setAt((f_path.getPath().getLength()-1), new google.maps.LatLng(lat, lng));
                        }
                    }
                },

                setPath: function(path){
                    if( !path.length ) return;

                    const f_pp = f_path.getPath();

                    f_pp.clear();
                    for( let i = 0, k = path.length; i < k; i++ ) f_pp.push(new google.maps.LatLng(path[i][1], path[i][0]));
                    last_point_lat = path[path.length-1][1];
                    last_point_lng = path[path.length-1][0];
                },

                show(){
                    f_path.setMap(_this.view_els.map);
                },

                clear: function(){
                    f_path.getPath().clear();
                    last_point_lat = null;
                    last_point_lng = null;
                },

                hide: function(){
                    f_path.setMap(null);
                }

            }

        }();

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


        //
        // Ответ на запрос присоединения
        const connection_response = function(resp){
            //console.log(resp);

            if( 'success' === resp.status ){

                // Положительный ответ приходит вместе с полной информацией о дроне
                // Обновляем инфо
                _this.drone_data.info.set(resp.info);
                _this.drone_data.params = resp.params;

                //
                //  Навешиваем события на сокет

                // Телеметрия
                _this.socket.off('telem1_' + _this.drone.id);
                _this.socket.on('telem1_' + _this.drone.id, telem1 => {
                    if( !telem1.length || telem1.length !== telem1_fields.length ) return;

                    // Расшифровка новых данных (преобразование из коллекции в именуемый объект)
                    let new_values = {};
                    for( let i = 0, k = telem1.length; i < k; i++ ){ new_values[telem1_fields[i]] = telem1[i]; }

                    // Старые данные
                    let old_values = _this.drone_data.telem_1hz.getValues();

                    // Сравнение новых и старых данных
                    // Очистить след, если дрон дезактивирован
                    if( new_values.armed !== old_values.armed ){
                        if( parseInt(new_values.armed) === 0 ) _this.flight_path.clear();
                    }

                    // Сохранение новых данных
                    _this.drone_data.telem_1hz.setValues(new_values, true);

                    // Обновление информации о дроне
                    _this.drone_data.info.set({
                        online: 1
                        ,last_message_time: helpers.now()
                        ,sys_status: new_values.sys_status
                    });

                    // Обновить положение маркера
                    _this.set_marker_position();
                    // Добавить точку в след
                    _this.flight_path.addPoint(new_values.lat, new_values.lon);
                    // Если есть точка назначения, то установить путь
                    if( new_values.dest_point ){
                        _this.destination_path.set([new_values.lat, new_values.lon], new_values.dest_point);
                        //console.log(new_values.dest_point);
                    }
                    else {
                        _this.destination_path.hide();
                    }

                    // Обновить информацию на экране
                    if( _this.view_enabled && _this.view ){
                        let t1 = _this.drone_data.telem_1hz.getValues();

                        _this.view_els.label_armed.setValue( t1.armed ? 'ARMED' : 'Disarmed' );

                        webix.$$('dvt:rs:mode').blockEvent();
                        if( webix.$$('dvt:rs:mode').isEnabled() ) webix.$$('dvt:rs:mode').setValue( t1.mode );
                        webix.$$('dvt:rs:mode').unblockEvent();

                        if( !_this.marker.getMap() ) _this.set_marker_map();

                        if( t1.armed && _this.view_els.arm_btn.isEnabled() ){
                            _this.view_els.arm_btn.hide();
                            _this.view_els.disarm_btn.show();
                        }
                        else if( !t1.armed && _this.view_els.disarm_btn.isEnabled() ) {
                            _this.view_els.disarm_btn.hide();
                            _this.view_els.arm_btn.show();
                        }
                    }

                });

                _this.socket.off('telem10_' + _this.drone.id);
                _this.socket.on('telem10_' + _this.drone.id, telem10 => {
                    if( !telem10.length || telem10.length !== telem10_fields.length ) return;

                    let values = {};
                    for( let i = 0, k = telem10.length; i < k; i++ ){ values[telem10_fields[i]] = telem10[i]; }
                    _this.drone_data.telem_10hz.setValues(values, true);


                    if( _this.view_enabled && _this.view ){
                        _this.view_els.horizon.setRoll(values.r);
                        _this.view_els.horizon.setPitch(values.p);
                        _this.view_els.compass.setHeading(values.y);

                        _this.set_marker_rotation();
                    }
                });

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
                        for( let i = 0, k = modes_list.length; i < k; i++ ){
                            _this.drone_data.modes.push({id: modes_list[i][0], value: modes_list[i][1]});
                        }

                        if( _this.view_enabled && _this.view && webix.$$('dvt:rs:mode') ){
                            webix.$$('dvt:rs:mode').getList().parse(_this.drone_data.modes);
                            if( !webix.$$('dvt:rs:mode').isEnabled() ) webix.$$('dvt:rs:mode').enable();
                            if( _this.drone_data.telem_1hz.getValues().mode !== null ){
                                webix.$$('dvt:rs:mode').setValue(_this.drone_data.telem_1hz.getValues().mode);
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
                _this.socket.on('board_mission_' + _this.drone.id, (response) => {
                    if( 'success' === response.status ) _this.mission.load(response.mission_data);
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
        _this.socket.on('connect', function(){
            _this.socket.emit('drone_gcs_connect', _this.drone.id, connection_response);
        });

        //
        // Дрон онлайн (ставится когда приходит инфо {online:1}
        this.status_online = function(){

            // Сообщение дрон ОНЛАЙН
            if( _this.drone.item.status !== 'online' ) Message.info(_this.drone.item.name + ' ONLINE');

            // Обновление статуса в таблице
            //_this.drone.item.status = 'online';
            DronesCollection.updateItem(_this.drone.id, {status: 'online'});

            // Обновление вида, если он открыт у дрона
            _this.view_online();

        };

        //
        // Обновление вида, если он открыт у дрона
        this.view_online = function(){

            if( !_this.view_enabled || !_this.view || _this.view.isEnabled() ) return;

            _this.set_marker_map(_this.view_els.map);
            if( _this.home_marker.getPosition().lat() !== 0 || _this.home_marker.getPosition().lng() !== 0  ) _this.home_marker.setMap(_this.view_els.map);

            _this.view.enable();
            _this.view.$scope.fi_popup.enable();

            webix.$$('dvt:tpl:offline').hide();

            webix.$$('dvt:icon:statuses').show();
            webix.$$('dvt:rs:mode').show();
            _this.view_els.label_armed.show();

            _this.view_els.telem_top.show({y:60, x: 50});

            webix.$$('dvt:btn:takeoff').show();
            webix.$$('dvt:btn:land').show();
            webix.$$('dvt:btn:rtl').show();

            webix.$$('dvt:icon:actions').show();

            // Показать джойстик если он включен в настройках
            //if( !!_this.drone_data.params.joystick_enable ){
            //    let joystick_view = _this.view.$scope.fi_popup.queryView({localId: 'cont:joystick1'});
            //if( joystick_view ) joystick_view.show();
            //}

            // Начало отправки heartbeat. Остановка по закрытию панели управления
            _this.heartbeat.start();

            // Загрузить с сервера точки следа
            _this.command('get_fp');

            // След
            _this.flight_path.show();
            _this.mission.show();
            _this.destination_path.show();

        };

        //
        // Дрон оффлайн
        this.status_offline = function(){

            // Сообщение дрон ОФФЛАЙН
            if( _this.drone.item.status === 'online' ) Message.warning(_this.drone.item.name + ' OFFLINE');

            // Обновление статуса в таблице
            _this.drone.item.status = 'offline';
            DronesCollection.updateItem(_this.drone.id, {status: 'offline'});

            _this.heartbeat.stop();

            _this.view_offline();

        };

        //
        // Обновление вида, если он открыт у дрона
        this.view_offline = function(){
            // Обновление вида, если он открыт у дрона
            if( !_this.view_enabled || !_this.view  ) return;

            _this.view.disable();
            _this.view.$scope.fi_popup.disable();

            webix.$$('dvt:icon:info').show();
            setTimeout(function(){webix.$$('dvt:icon:info').callEvent('onItemClick')},500);

            webix.$$('dvt:icon:statuses').hide();
            webix.$$('dvt:rs:mode').hide();
            _this.view_els.label_armed.hide();
            _this.view_els.telem_top.hide();
            _this.view_els.arm_btn.hide();
            _this.view_els.disarm_btn.hide();
            webix.$$('dvt:btn:takeoff').hide();
            webix.$$('dvt:btn:land').hide();
            webix.$$('dvt:btn:rtl').hide();

            webix.$$('dvt:icon:actions').hide();
            _this.view_els.takeoff_popup.hide();

            // Шаблон 'Drone offline'

            if( webix.$$('dvt:tpl:offline') && !webix.$$('dvt:tpl:offline').isVisible() ){
                webix.$$('dvt:tpl:offline').show();
            }

        };


    }


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

        this.view = view;
        this.view_enabled = true;

        const _this = this;

        //
        //  Объекты вида
        this.view_els = {
             horizon: view.$scope.fi_popup.queryView({localId: 'fi:horizon'})
            ,compass: view.$scope.fi_popup.queryView({localId: 'fi:compass'})
            ,label_armed: webix.$$('dvt:lbl:armed')
            ,telem_top: view.$scope.telemetry_popup.queryView({localId:'tpl:telem_top'}) // Шаблон с телеметрией наверху
            ,map: view.$scope.$$('map:drone').getMap() // Объект карты Google

            // Кнопки ARM, DISARM
            ,arm_btn: webix.$$('dvt:btn:arm')
            ,disarm_btn: webix.$$('dvt:btn:disarm')

            // Кнопки управления
            ,takeoff_btn: webix.$$('dvt:btn:takeoff')
            ,land_btn: webix.$$('dvt:btn:land')
            ,rtl_btn: webix.$$('dvt:btn:rtl')

            // Всплывающие окна
            ,takeoff_popup: view.$scope.takeoff_popup
            ,takeoff_alt: view.$scope.takeoff_popup.queryView({localId: 'fld:alt'})
            ,takeoff_confirm: view.$scope.takeoff_popup.queryView({localId: 'btn:takeoff'})

        };
        //
        //



        // Обработка кликов на карте
        this.mapClickListener = this.view_els.map.addListener('click', this.mapClickHandler);

        // Список статусов
        const statuses_list = view.$scope.statuses_popup.queryView({localId: 'list:statuses'});

        // Меню выбора полетного режима
        const mode_select = webix.$$('dvt:rs:mode');

        // Кнопка загрузки миссии с борта
        const get_mission_button = view.$scope.action_menu.queryView({localId: 'btn:get_mission'});

        // Выключатели реле
        const relay1_switch = view.$scope.action_menu.queryView({localId: 'sw:rel1'});
        const relay2_switch = view.$scope.action_menu.queryView({localId: 'sw:rel2'});
        const relay3_switch = view.$scope.action_menu.queryView({localId: 'sw:rel3'});
        const relay4_switch = view.$scope.action_menu.queryView({localId: 'sw:rel4'});

        // Плеер и видеошум
        const video_player_tpl = view.$scope.fi_popup.queryView({localId:'tpl:video_player'});
        const video_noise_tpl = view.$scope.fi_popup.queryView({localId:'tpl:video_noise'});

        // Шаблон информации
        const popup_info_tpl = view.$scope.info_popup.queryView({localId: 'tpl:info'});
        const drone_udp_switch = view.$scope.info_popup.queryView({localId: 'sw:drone_udp'});
        const drone_udp_info = view.$scope.info_popup.queryView({localId: 'tpl:info_udp'});
        const gcs_tcp_switch = view.$scope.info_popup.queryView({localId: 'sw:gcs_tcp'});
        const gcs_tcp_info = view.$scope.info_popup.queryView({localId: 'tpl:info_tcp'});


        // Джойстик
        const joystick = view.$scope.fi_popup.queryView({view: 'joystick'});

        // Если установлен тип и доступны режимы
        if( _this.drone_data.modes && _this.drone_data.modes.length ){
            // Загрузим их в меню
            mode_select.getList().parse(_this.drone_data.modes);
        }


        //
        //  Отобразить данные на экране
        //

        // Маркер на карте
        _this.set_marker_map();

        // Привязка списка статусов
        statuses_list.data.sync(_this.drone_data.statuses_collection);

        // Привязка шаблона информации
        popup_info_tpl.bind(_this.drone_data.info.record());
        drone_udp_info.bind(_this.drone_data.info.record());
        gcs_tcp_info.bind(_this.drone_data.info.record());


        // Привязка шаблона к данным телеметрии
        _this.view_els.telem_top.bind(_this.drone_data.telem_1hz);

        // Клик на домике передвигает карту на Home position
        _this.view_els.telem_top.attachEvent('clickOnHome', () => {
            if( _this.drone_data.info.get('h_pos_lat') && _this.drone_data.info.get('h_pos_lon') ){
                _this.view_els.map.panTo(_this.home_marker.getPosition());
                _this.view_els.map.setZoom(18);
            }
            else {
                Message.error('Home position is not set');
            }
        });

        //
        //  Обработка событий
        //

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

        // TODO Кнопка Посадка


        // TODO Кнопка RTL


        // Переключение полетных режимов
        mode_select.attachEvent('onChange', function(new_value, old_value){
            mode_select.disable();

            _this.command('set_mode', {
                mode: new_value
            }).then(function(res){

                setTimeout(function() {
                    mode_select.enable();
                }, 1100);

            }).catch(function(res){

                Message.error('Failed to set mode: ' + res);

                mode_select.blockEvent();
                mode_select.setValue(old_value);
                mode_select.unblockEvent();

                setTimeout(function() {
                    mode_select.enable();
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

        // Кнопка Загрузить миссию с борта
        get_mission_button.attachEvent('onItemClick', function(){
            get_mission_button.disable();
            _this.command('get_mission').then(function(res){
                Message.info('Get mission: ' + res);
                get_mission_button.enable();
            }).catch(function(res){
                if( 'rejected' === res ){
                    Message.error('No mission onboard');
                    _this.mission.clear();
                }
                else {
                    Message.error('Mission download FAILED: ' + res);
                }

                get_mission_button.enable();
            });
        });

        // Переключатель Реле 1
        relay1_switch.attachEvent('onChange', (value, old_value) => {

            relay1_switch.disable();

            let switch_position = value ? 'on' : 'off';

            _this.command('switch_relay', {relay: 1, switch: switch_position}).then(function(res){
                if( 'success' === res ){
                    relay1_switch.enable();
                    Message.info('Relay 1 switched ' + switch_position.toUpperCase());
                }
            }).catch(function(err){
                relay1_switch.blockEvent();
                relay1_switch.setValue(old_value);
                relay1_switch.unblockEvent();
                relay1_switch.enable();
                Message.error('Failed to switch Relay 1: ' + err);
            });

        });

        // Переключатель Реле 2
        relay2_switch.attachEvent('onChange', (value, old_value) => {

            relay2_switch.disable();

            let switch_position = value ? 'on' : 'off';

            _this.command('switch_relay', {relay: 2, switch: value ? 'on' : 'off'}).then(function(res){
                if( 'success' === res ){
                    relay2_switch.enable();
                    Message.info('Relay 2 switched ' + switch_position.toUpperCase());
                }
            }).catch(function(err){
                relay2_switch.blockEvent();
                relay2_switch.setValue(old_value);
                relay2_switch.unblockEvent();
                relay2_switch.enable();
                Message.error('Failed to switch Relay 2: ' + err);
            });

        });

        // Переключатель Реле 3
        relay3_switch.attachEvent('onChange', (value, old_value) => {

            relay3_switch.disable();

            let switch_position = value ? 'on' : 'off';

            _this.command('switch_relay', {relay: 3, switch: value ? 'on' : 'off'}).then(function(res){
                if( 'success' === res ){
                    relay3_switch.enable();
                    Message.info('Relay 3 switched ' + switch_position.toUpperCase());
                }
            }).catch(function(err){
                relay3_switch.blockEvent();
                relay3_switch.setValue(old_value);
                relay3_switch.unblockEvent();
                relay3_switch.enable();
                Message.error('Failed to switch Relay 3: ' + err);
            });

        });

        // Переключатель Реле 4
        relay4_switch.attachEvent('onChange', (value, old_value) => {

            relay4_switch.disable();

            let switch_position = value ? 'on' : 'off';

            _this.command('switch_relay', {relay: 4, switch: value ? 'on' : 'off'}).then(function(res){
                if( 'success' === res ){
                    relay4_switch.enable();
                    Message.info('Relay 4 switched ' + switch_position.toUpperCase());
                }
            }).catch(function(err){
                relay4_switch.blockEvent();
                relay4_switch.setValue(old_value);
                relay4_switch.unblockEvent();
                relay4_switch.enable();
                Message.error('Failed to switch Relay 4: ' + err);
            });

        });

        // Запуск/остановка UDP сервера
        drone_udp_switch.setValue( parseInt(_this.drone_data.info.get('udp_ip_s')) === 1 ? 1 : 0);
        drone_udp_switch.attachEvent('onChange', function(value, old_value) {

            const sw = this;

            sw.disable();

            if( parseInt(value) === 1 ){
                // Запустить UDP
                _this.drone_data.info.set({udp_ip_c: 'starting...'});

                _this.socket.rpc('droneStartUDP', {drone_id: _this.drone.id})
                    .then(function(){
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
                        _this.socket.rpc('droneStopUDP', {drone_id: _this.drone.id})
                            .then(function () {
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
        gcs_tcp_switch.setValue( parseInt(_this.drone_data.info.get('tcp_op_s')) === 1 ? 1 : 0);
        gcs_tcp_switch.attachEvent('onChange', function(value, old_value) {
            const sw = this;

            sw.disable();

            if( parseInt(value) === 1 ){
                // Запустить TCP
                _this.drone_data.info.set({tcp_op_c: 'starting...'});

                _this.socket.rpc('droneStartGCSTCP', {drone_id: _this.drone.id})
                    .then(function(result){
                        Message.info('TCP server started');
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
                        _this.socket.rpc('droneStopGCSTCP', {drone_id: _this.drone.id})
                            .then(function (result) {
                                Message.info('TCP server stopped');
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

        // Джойстик
        joystick.setController( _this.drone_data.joystick.set );

        // Видео
        try {
            // Nimble Streamer on the same domain
            if( _this.drone_data.params.rtsp_video_url && _this.drone_data.params.rtsp_video_url.trim().length > 2 ){

                let stream_url = '';
                stream_url += ('https:' === window.location.protocol ? 'wss://' : 'ws://' );
                stream_url += window.location.hostname;
                stream_url += (window.location.port === '' ? '' : ':8081');
                stream_url += '/vs/' + _this.drone_data.params.rtsp_video_url.trim();

                _this.player = window.SLDP.init({
                    container: 'video_player',
                    stream_url: stream_url,
                    width: 500,
                    height: 285,
                    buffering: 0,
                    latency_tolerance: 100,
                    adaptive_bitrate: false,
                    muted: true,
                    autoplay: true
                });
            }
            else {
                video_noise_tpl.show();
            }
        }
        catch(e){
            console.log(e);
        }

        //
        //   Установка вида онлайн или оффлайн
        _this.drone.isOnline() ?  _this.view_online() : _this.view_offline();

    }


    //
    // Свернуть вид и его обновление
    view_stop(){

        try {
            this.heartbeat.stop();

            if( !this.view_enabled ) return;

            // Удалить обработчик кликов с карты
            if( this.mapClickListener ) {
                this.mapClickListener.remove();
                this.mapClickListener = null;
            }


            if( this.marker ) this.marker.setMap(null);
            if( this.home_marker ) this.home_marker.setMap(null);
            this.flight_path.hide();
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

export default DroneClient;
