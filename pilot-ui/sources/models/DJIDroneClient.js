"use strict";

import common_config from '../../../configs/common_config';
import helpers from '../../../utils/helpers';
import Message from '../plugins/Message';
import DronesCollection from './DronesCollection';
import {dji_telem1_fields, dji_telem10_fields} from '../../../defs/io_telemetry_fields';


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
class DJIDroneClient {

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
                        jlx = Math.round(pos.x);
                        jly = Math.round(pos.y);
                    }
                    ,set_right: function(pos){
                        jrx = Math.round(pos.x);
                        jry = Math.round(pos.y);
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
                    ,set: function(values = {}){

                        let current_info = record.getValues();

                        // Проверить изменения, поставить оффлайн или онлайн
                        // Установка ОНЛАЙН или ОФФЛАЙН
                        if( values.hasOwnProperty('online') && parseInt(values.online) !== parseInt(current_info.online) ){
                            if( parseInt(values.online) === 1 ) _this.status_online();
                            else   _this.status_offline();
                        }

                        // Home position
                        /*
                        if( values.hasOwnProperty('h_pos_lat') && values.hasOwnProperty('h_pos_lon') && values.h_pos_lat && values.h_pos_lon ){
                           _this.home_marker.setPosition({lat: parseFloat(values.h_pos_lat), lng: parseFloat(values.h_pos_lon)});

                           _this.mission.setHome(parseFloat(values.h_pos_lat), parseFloat(values.h_pos_lon));

                            if( _this.view_enabled && _this.view_els.map ){
                                _this.home_marker.setMap(_this.view_els.map);
                            }
                        }

                         */


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

        this.RPC = (method, data) => {
            return _this.socket.rpc('droneRPC', {drone_id: _this.drone.id, method: method, data: data});
        };

        //
        // Маркер на карте
        this.drone_marker = function(){
            let map_init_position_set = false;

            const marker = new google.maps.Marker({
                icon: marker_icon_params
                ,zIndex: 100
            });

            let map = null;

            const panMap = function(){
                map_init_position_set = true;
                map.panTo(marker.getPosition());
                map.setZoom(18);
            };

            _this.drone_data.telem_1hz.attachEvent('onChange', rec => {
                let lat = parseFloat(rec.lat);
                let lon = parseFloat(rec.lon);

                // TODO
                if( isNaN(lat) || isNaN(lon) ) return Message.error('No position data');

                marker.setPosition({lat: lat, lng: lon});
                if( !marker.getMap() && map ) marker.setMap(map);
                if( !map_init_position_set ) panMap();

            });

            _this.drone_data.telem_10hz.attachEvent('onChange', rec => {
                let yaw = parseInt(rec.yaw);
                if( isNaN(yaw) ) yaw = 0;
                marker_icon_params.rotation = yaw;

                marker.setIcon(marker_icon_params);
            });

            return {
                setMap: function(mapObj){
                    if( mapObj === null ){
                        marker.setMap(null);
                        return;
                    }

                    map = mapObj;

                    if( marker.getPosition() ) {
                        marker.setMap(map);
                        panMap();
                    }
                }
            };
        }();

        // Маркер точки старта
        this.home_marker = new google.maps.Marker({
             icon: home_marker_icon_params
            ,label: {text: 'H', color: '#ffbd4d'}
            ,opacity: 0.8
            ,zIndex: 1
        });

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

        //
        // Обработчик кликов на карте для установки точки назначения
        this.mapClickHandler = function(event){
            console.log(event.latLng.lat(), event.latLng.lng());

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

            return new Promise(function(resolve, reject){
                // Отправляем команду
                _this.socket.emit('drone_command_' + _this.drone.id, {
                    command: command
                    ,params: params
                });

                resolve('success');

            });

        };

        //
        // Отправка heartbeat и джойстика
        this.heartbeat = function(){

            let status = false; // false=stopped, true=started

            const intervals = {
                heartbeat: null
                ,joystick: null
            };

            const send_heartbeat = function(){
                //console.log("Send GCS heartbeat");
                _this.command('gcs_heartbeat', {});
            };

            const send_joystick = function(){
                if( _this.drone.isOnline() ){
                    let jd = _this.drone.joystick.get();
                    _this.command('joystick', jd);
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
                    intervals.heartbeat = null;
                    intervals.joystick =null;
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
            let last_point_lat = null, last_point_lng = null;

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
            console.log("DJI Connection response", resp);

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
                    //console.log("Telem 1", telem1);

                    if( !telem1.length || telem1.length !== dji_telem1_fields.length ) return;

                    // Расшифровка новых данных (преобразование из коллекции в именуемый объект)
                    let new_values = {};
                    telem1.forEach( (v, i) => { new_values[dji_telem1_fields[i]] = v; } );

                    // Старые данные
                    let old_values = _this.drone_data.telem_1hz.getValues();

                    // Сравнение новых и старых данных
                    // Очистить след, если дрон дезактивирован
                    if( new_values.armed !== old_values.armed ){
                        if( parseInt(new_values.armed) === 1 ) _this.flight_path.clear();
                    }

                    // Сохранение новых данных
                    _this.drone_data.telem_1hz.setValues(new_values, true);

                    // Обновление информации о дроне
                    _this.drone_data.info.set({
                        online: 1
                        ,last_message_time: helpers.now()
                    });

                    // Добавить точку в след
                    _this.flight_path.addPoint(new_values.lat, new_values.lon);

                    // Если есть точка назначения, то установить путь
                    //if( new_values.dest_point ) _this.destination_path.set([new_values.lat, new_values.lon], new_values.dest_point);
                    //else _this.destination_path.hide();


                    // Обновить информацию на экране
                    if( _this.view_enabled && _this.view ){

                        _this.view_els.label_armed.setValue( parseInt(new_values.armed) ? 'ARMED' : 'Disarmed' );

                        let mode_name = 'Unknown';
                        if( new_values.mode_name && new_values.mode_name.length ) mode_name = new_values.mode_name;
                        _this.view_els.label_mode.setValue('Mode: ' + mode_name);

                        if( parseInt(new_values.armed) && _this.view_els.arm_btn.isEnabled() ){
                            _this.view_els.arm_btn.hide();
                            _this.view_els.disarm_btn.show();
                        }
                        else if( !parseInt(new_values.armed) && _this.view_els.disarm_btn.isEnabled() ) {
                            _this.view_els.disarm_btn.hide();
                            _this.view_els.arm_btn.show();
                        }


                        // Виджеты
                        // Спутники
                        let sats = parseInt(new_values.sats);
                        if( isNaN(sats) ) sats = 0;
                        if( sats < 4 ) _this.view_els.tw_sats.setState('danger');
                        else if( sats < 8 ) _this.view_els.tw_sats.setState('warn');
                        else _this.view_els.tw_sats.setState('normal');

                        // Батарея
                        let bat_pc = parseInt(new_values.bat_remains_percent);
                        if( isNaN(bat_pc) ) bat_pc = 0;
                        if( bat_pc <= 30 ) _this.view_els.tw_bat_r.setState("danger");
                        else if( bat_pc <= 50 ) _this.view_els.tw_bat_r.setState("warn");
                        else _this.view_els.tw_bat_r.setState("normal");

                        let bat_icon_value = Math.round(bat_pc/10)*10;
                        let bat_icon = "battery-outline"; // 0
                        if( bat_icon_value === 100 ) bat_icon = "battery";
                        else if( bat_icon_value > 0 ) bat_icon = "battery-" + bat_icon_value;
                        _this.view_els.tw_bat_r.setIcon(bat_icon);

                    }

                });

                _this.socket.off('telem10_' + _this.drone.id);
                _this.socket.on('telem10_' + _this.drone.id, telem10 => {

                    if( !telem10.length || telem10.length !== dji_telem10_fields.length ) return;

                    let new_values = {};
                    telem10.forEach( (v, i) => { new_values[dji_telem10_fields[i]] = v; } );

                    //console.log("t10", new_values);
                    _this.drone_data.telem_10hz.setValues(new_values, true);

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
                _this.socket.on('info_' + _this.drone.id, data => {
                    //console.log("INFO", data);
                    if( parseInt(data.online) ) data.last_message_time = helpers.now();
                    _this.drone_data.info.set(data);
                });

                // Список полетных режимов
                _this.socket.off('modes_' + _this.drone.id);
                _this.socket.on('modes_' + _this.drone.id, function(modes_list){
                    if( modes_list && modes_list.length ){

                    }
                });

                // Сообщение с подтверждением исполнения команды
                _this.socket.off('com_ack_' + _this.drone.id);
                _this.socket.on('com_ack_' + _this.drone.id, data => {
                    // Передается в ожидающую функцию
                    //_this.command_ack.set(data.command, data.result);  // MAV_CMD, MAV_RESULT
                });

                // Точки следа
                _this.socket.off('fp_' + _this.drone.id);
                _this.socket.on('fp_' + _this.drone.id, _this.flight_path.setPath);

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

            // Обновление вида, если он открыт у дрона
            _this.view_online();

        };

        //
        // Обновление вида, если он открыт у дрона
        this.view_online = function(){

            if( !_this.view_enabled || !_this.view ) return;

            if( _this.home_marker.getPosition() ) _this.home_marker.setMap(_this.view_els.map);

            //_this.view.enable();
            //_this.view.$scope.fi_popup.enable();

            hide_view_els(['top_tpl_offline']);
            show_view_els(['label_mode','btn_guided','btn_cm_loiter','takeoff_btn','land_btn','rtl_btn','label_armed','top_icon_statuses','top_icon_actions']);

            // Показать виджеты телеметрии
            _this.view_els.telem_top.show({y:60, x: 50});

            // Начало отправки heartbeat. Остановка по закрытию панели управления или если дрон оффлайн
            _this.heartbeat.start();

            // Загрузить с сервера точки следа
            _this.command('get_fp');

            // След
            _this.flight_path.show();
            // Полетный план
            _this.mission.show();
            // Путь назначения
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
            clearInterval(_this.check_online_interval);
            _this.check_online_interval = null;

            _this.view_offline();

        };

        //
        // Обновление вида, если он открыт у дрона
        this.view_offline = function(){
            // Обновление вида, если он открыт у дрона
            if( !_this.view_enabled || !_this.view  ) return;

            //_this.view.disable();
            //_this.view.$scope.fi_popup.disable();

            // Скрыть элементы управления
            hide_view_els(['label_armed','telem_top','arm_btn','disarm_btn','label_mode','btn_guided','takeoff_btn','land_btn','rtl_btn','btn_cm_loiter',
                'takeoff_popup','params_list_popup','logs_list_popup','top_icon_actions']);
            // Показать элементы управления
            show_view_els(['top_icon_info','top_icon_statuses','top_tpl_offline','top_icon_actions']);

            // FIXME удалить
            _this.view_els.telem_top.show({y:60, x: 50});
            //

        };

        let playerInitTimeout = null;
        //
        // Инициализация видеоплеера
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

            playerInitTimeout = null;
        };


        console.log("DJIDrone client init OK");

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

        let time_point = helpers.now_ms();

        this.view = view;
        this.view_enabled = true;

        const _this = this;

        //
        //  Объекты вида
        this.view_els = {

            //
            // Верхняя панель

            // Кнопка Инфо
            top_icon_info: webix.$$('dvt:icon:info')
            , popup_info_tpl: view.$scope.info_popup.queryView({localId: 'tpl:info'})
            // Шаблон онлайн/оффлайн
            , top_tpl_offline: webix.$$('dvt:tpl:offline')
            // Кнопка списка сообщений и статусов
            , top_icon_statuses: webix.$$('dvt:icon:statuses')
            // Меню и шаблон режимов
            , label_mode: webix.$$('dvt:lbl:mode')
            // Шаблон Armed
            , label_armed: webix.$$('dvt:lbl:armed')
            // Кнопки ARM, DISARM
            , arm_btn: webix.$$('dvt:btn:arm')
            , disarm_btn: webix.$$('dvt:btn:disarm')
            // Кнопки управления режимами
            , btn_guided: webix.$$('dvt:btn:md_guided')
            , btn_cm_loiter: webix.$$('dvt:btn:cm_loiter')
            , takeoff_btn: webix.$$('dvt:btn:takeoff')
            , land_btn: webix.$$('dvt:btn:land')
            , rtl_btn: webix.$$('dvt:btn:rtl')
            // Меню доп функция
            , top_icon_actions: webix.$$('dvt:icon:actions')

            , map: view.$scope.$$('map:drone').getMap() // Объект карты Google

            , fi_popup: view.$scope.fi_popup
            , horizon: view.$scope.fi_popup.queryView({localId: 'fi:horizon'})
            , compass: view.$scope.fi_popup.queryView({localId: 'fi:compass'})

            , telem_top: view.$scope.telemetry_popup // Шаблон с телеметрией наверху
            , tw_map_center: view.$scope.telemetry_popup.queryView({localId: 'tw:mapCenter'})
            , tw_alt: view.$scope.telemetry_popup.queryView({localId: 'tw:alt'})
            , tw_speed: view.$scope.telemetry_popup.queryView({localId: 'tw:speed'})
            , tw_sats: view.$scope.telemetry_popup.queryView({localId: 'tw:sats'})
            , tw_bat_r: view.$scope.telemetry_popup.queryView({localId: 'tw:bat_r'})


            //
            // Всплывающие окна и их элементы

            // Action menu
            , action_menu_popup: view.$scope.action_menu
            , btn_logs_list: view.$scope.action_menu.queryView({localId: 'btn:get_logs_list'})
            , btn_params_list: view.$scope.action_menu.queryView({localId: 'btn:params_list'})

            // Takeoff
            , takeoff_popup: view.$scope.takeoff_popup
            , takeoff_alt: view.$scope.takeoff_popup.queryView({localId: 'fld:alt'})
            , takeoff_confirm: view.$scope.takeoff_popup.queryView({localId: 'btn:takeoff'})

            // Переключатель источника видео
            , video_switch: view.$scope.fi_popup.queryView({localId: 'switch:video_src'})

        };
        //
        //

        // Привязка маркера к карте
        this.drone_marker.setMap(this.view_els.map);

        // Обработка кликов на карте
        this.mapClickListener = this.view_els.map.addListener('click', this.mapClickHandler);

        // Перемещение карты отключает некоторые функции
        this.view_els.map.addListener('dragstart', ()=>{});
        this.view_els.map.addListener('dragend', ()=>{});

        // Список статусов
        const statuses_list = view.$scope.statuses_popup.queryView({localId: 'list:statuses'});

        // Джойстик
        const joystick_left = view.$scope.fi_popup.queryView({j_id: 'j_left'}),
              joystick_right = view.$scope.fi_popup.queryView({j_id: 'j_right'}),
              joystick_gimbal = view.$scope.fi_popup.queryView({j_id: 'j_gimb'});

        //
        //  Отобразить данные на экране
        //

        // Привязка виджетов телеметрии к данным
        _this.view_els.tw_alt.connectDataRecord(_this.drone_data.telem_1hz);
        _this.view_els.tw_speed.connectDataRecord(_this.drone_data.telem_1hz);
        _this.view_els.tw_sats.connectDataRecord(_this.drone_data.telem_1hz);
        _this.view_els.tw_bat_r.connectDataRecord(_this.drone_data.telem_1hz);
        // Привязка компаса и горизонта к данным
        _this.view_els.horizon.connectDataRecord(_this.drone_data.telem_10hz);
        _this.view_els.compass.connectDataRecord(_this.drone_data.telem_10hz);

        // Привязка списка статусов
        statuses_list.data.sync(_this.drone_data.statuses_collection);

        // Привязка шаблона информации
        _this.view_els.popup_info_tpl.bind(_this.drone_data.info.record());

        /* Клик на домике передвигает карту на Home position
        _this.view_els.telem_top.attachEvent('clickOnHome', () => {
            if( _this.drone_data.info.get('h_pos_lat') && _this.drone_data.info.get('h_pos_lon') ){
                _this.view_els.map.panTo(_this.home_marker.getPosition());
                _this.view_els.map.setZoom(18);
            }
            else {
                Message.error('Home position is not set');
            }
        });
         */

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

        // Кнопка центрирования на карте
        _this.view_els.tw_map_center.attachEvent('onItemClick', () => {

            if( "active" === _this.view_els.tw_map_center.getState() ){
                _this.view_els.tw_map_center.setState("normal");
                //Message.info("Map center click Norm");
                //_this.view_els.map.setHeading(0);
            }
            else {
                _this.view_els.tw_map_center.setState("active");
                //Message.info("Map center click Active");

                let bounds = _this.view_els.map.getBounds();
                if( bounds ){
                    let top = bounds.getNorthEast().lat(),
                        right = bounds.getNorthEast().lng(),
                        bottom = bounds.getSouthWest().lat(),
                        left = bounds.getSouthWest().lng();

                    //_this.view_els.map.setHeading(45);
                    // console.log(top, bottom, left, right);
                    // map.panTo({lat, lng})
                }
            }

        });

        // Джойстик
        joystick_left.setController( _this.drone.joystick.set_left );
        joystick_right.setController( _this.drone.joystick.set_right );

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


        console.log('Drone view setup', (helpers.now_ms()-time_point));

    }


    //
    // Свернуть вид и его обновление
    view_stop(){

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

export default DJIDroneClient;
