import {JetView} from "webix-jet";
import helpers from '../../../utils/helpers';
import DronesCollection from "../models/DronesCollection";


let top_controls_id = null;


export default class DroneView extends JetView {

    config(){
        return view_config;
    }

    init(view, url){
        this.action_menu = this.ui(action_menu_popup);
        this.info_popup = this.ui(info_popup);
        this.statuses_popup = this.ui(statuses_popup);
        this.fi_popup = this.ui(fi_popup);
        this.telemetry_popup = this.ui(telemetry_popup);
        this.takeoff_popup = this.ui(takeoff_popup);

        top_controls_id = webix.$$('top_view_controls').addView(view_controls);

        webix.TooltipControl.addTooltip(this.telemetry_popup.$view);

    }

    ready(view, url){

        const _this = this;
        const map = this.$$('map:drone');
        const top_toolbar = webix.$$('top_toolbar');


        map.getMap(true).then(function(mapObj) {
            mapObj.setOptions(map_options);

            _this.fi_popup.show({y:60, x: (top_toolbar.$width - 530)});

            _this.fi_popup.queryView({view: 'joystick'}).showJoystick();

            // drone_id передается в параметре открытия вида
            const drone_id = _this.getParam("id");

            // Если параметра нет или он не найден в коллекции с дронами
            // Открыть список
            if( !drone_id || !DronesCollection.getItem(drone_id) || !DronesCollection.Drones[drone_id] ){
                _this.app.show('/app/drones_list');
                return;
            }

            // Ссылка на экземпляр класса
            const drone_item = DronesCollection.getItem(drone_id);
            const drone = DronesCollection.Drones[drone_id];

            // Сделать в заголовке ссылку на список и добавить название дрона
            _this.app.getService('topTitle').update([{text: 'Drones', link: '/app/drones_list'}, {text: drone_item.name}]);

            // Запустить для дрона активный вид
            drone.view_start(view);

        });


    }

    destroy(){
        if( webix.$$('top_view_controls') && top_controls_id ){
            webix.$$('top_view_controls').removeView(top_controls_id);
            top_controls_id = null;
        }

        // Для всех дронов остановить активный вид
        DronesCollection.data.each(function(drone){
            if( DronesCollection.Drones[drone.id] ) DronesCollection.Drones[drone.id].view_stop();
        });
    }

}


// Меню с кнопками управления
const action_menu_popup = {
    view: 'popup'
    ,id: 'drone_view_popup_action_menu'
    ,body: {
        width:300
        ,rows: [
            {
                padding: 20
                ,rows: [
                    { view: "switch", value: 0, label: "Relay 1",localId: 'sw:rel1' }
                    ,{ view: "switch", value: 0, label: "Relay 2",localId: 'sw:rel2' }
                    ,{ view: "switch", value: 0, label: "Relay 3",localId: 'sw:rel3' }
                    ,{ view: "switch", value: 0, label: "Relay 4",localId: 'sw:rel4' }
                ]
            }

            ,{
                padding: 20
                ,cols: [
                    {
                        view: 'button'
                        ,type: 'iconButton'
                        ,localId: 'btn:get_mission'
                        ,label: 'Download mission'
                        ,icon: 'mdi mdi-download'
                    }
                ]
            }
            ,{}
        ]

    }
};

// Окошко с информацией
const info_popup = {
    view: 'popup'
    ,id: 'drone_view_popup_info'
    ,body: {
        width: 350
        ,borderless: true
        ,padding: 20
        ,rows: [
            {
                view: 'template'
                ,template: function(data){
                    let templ = '';

                    if( parseInt(data.last_message_time) <= 0 ){
                        templ += 'Never been connected';
                    }
                    else {
                        templ += 'Status: <b>' + (parseInt(data.online) === 1 ? `online (${data.sys_status})`  : 'offline'  ) + '</b><br/>';
                        if( parseInt(data.online) === 1 ) {
                            templ += 'Uptime: ' + helpers.timeFormat1(data.uptime) + '<br/>';
                            templ += '';
                        }
                        else {
                            templ += 'Downtime: ' + helpers.timeFormat1(data.downtime) + '<br/>';
                            if( parseFloat(data.last_pos_lat) && parseFloat(data.last_pos_lon) ){
                                templ += 'Last postion: ' + data.last_pos_lat + ', ' + data.last_pos_lon + '<br/>';
                            }
                            else {
                                templ += 'Last position unknown<br/>';
                            }
                        }
                        templ += 'Autopilot: ' + ( data.at ? data.at : 'unknown' ) + ', frame: ' + ( data.ft ? data.ft : 'unknown' ) + '<br/>';
                        templ += '';
                    }

                    return templ;
                }
                ,localId: 'tpl:info'
                ,height: 80
                ,borderless: true
            }
            ,{
                cols: [
                    { view: "switch", value: 0, localId: 'sw:drone_udp', width: 60 }
                    ,{ view: 'label', label: 'Drone UDP server', fillspace: 2}
                ]
            }
            ,{
                view: 'template'
                ,localId: 'tpl:info_udp'
                ,height: 40
                ,borderless: true
                ,template: function(data){
                    return data.udp_ip_c ? data.udp_ip_c : '';
                }
            }

            ,{
                cols: [
                    { view: "switch", value: 0, localId: 'sw:gcs_tcp', width: 60 }
                    ,{ view: 'label', label: 'GCS TCP server', fillspace: 2}
                ]
            }
            ,{
                view: 'template'
                ,localId: 'tpl:info_tcp'
                ,height: 40
                ,borderless: true
                ,template: function(data){
                    return data.tcp_op_c ? data.tcp_op_c : '';
                }
            }
        ]

    }
};

// Окошко с сообщениями статусов
const statuses_popup = {
    view: 'popup'
    ,id: 'drone_view_popup_statuses'
    ,body: {
        width: 350
        ,height: 400
        ,borderless: true
        ,rows: [
            {
                view: 'list'
                ,localId: 'list:statuses'
                ,template: '#text#'
            }
        ]

    }
};

// Окошко с установкой высоты для взлета
const takeoff_popup = {
    view: 'window'
    ,id: 'drone_view_popup_takeoff'
    ,headHeight: 0
    ,head: false
    ,borderless: true
    ,position: 'center'
    ,move: true
    ,body: {
        padding: 20
        ,width: 300
        //,height: 150
        ,rows: [
            { view: 'counter', label: 'Takeoff altitude', step: 1, value: 10, min: 1, max: 100, labelWidth: 130, localId: 'fld:alt' }
            ,{height:20}
            ,{
                cols: [
                    { view: 'button', label: 'Takeoff', type: 'iconButton', icon: 'mdi mdi-airplane-takeoff', localId: 'btn:takeoff' }
                    ,{width:20}
                    ,{ view: 'button', label: 'Cancel', type: 'iconButton', icon: 'mdi mdi-cancel', click: function(){
                            this.getTopParentView().hide();
                        } }
                ]
            }
        ]
    }
};

//
// Кнопки для верхней панели
const view_controls = {
    cols: [
        //,{ view: 'button', type: 'iconButton', icon: 'mdi mdi-settings', label: 'Setup your drone', width: 200, id: 'dvt:btn:setup', css: 'button_primary button_raised', hidden: true}

        // Кнопка с информацией
        { view: 'icon', id: 'dvt:icon:info', icon: 'mdi mdi-information', popup: 'drone_view_popup_info', tooltip: 'Drone info' }
        // Drone offline label
        ,{view: 'label', id: 'dvt:tpl:offline', label: 'drone offline', borderless: true, hidden: true, width: 150, css: "header_label" }
        // Кнопка со списком статусов
        ,{ view: 'icon', id: 'dvt:icon:statuses', icon: 'mdi mdi-bullhorn', popup: 'drone_view_popup_statuses', hidden: true, tooltip: 'Statuses' }
        ,{ width: 20 }
        // Label armed / disarmed
        ,{view: 'label', label: '', width: 80, id: 'dvt:lbl:armed', hidden: true }
        // ARM / DISARM кнопки
        ,{view: 'button', value: 'ARM', id: 'dvt:btn:arm', width: 100, hidden: true, tooltip: 'Activate motors' }
        ,{view: 'button', value: 'DISARM', id: 'dvt:btn:disarm', type: 'danger', width: 100, hidden: true, tooltip: 'Deactivate motors'}
        ,{ width: 20 }
        // Flight mode set status
        ,{
            view: 'richselect'
            ,id: 'dvt:rs:mode'
            ,labelWidth: 0
            ,width: 200
            ,options: []
            , hidden: true
            ,tooltip: 'Set flight mode'
        }

        // Кнопки взлет, посадка, RTL
        ,{
            view: 'button'
            ,type: 'iconButton'
            ,id: 'dvt:btn:takeoff'
            ,label: 'Takeoff'
            ,icon: 'mdi mdi-airplane-takeoff'
            ,tooltip: 'Takeoff from current location'
            ,autowidth: true
            ,hidden: true
        }
        ,{
            view: 'button'
            ,type: 'iconButton'
            ,id: 'dvt:btn:land'
            ,label: 'Land'
            ,icon: 'mdi mdi-airplane-landing'
            ,tooltip: 'Land at current location'
            ,autowidth: true
            ,hidden: true
        }
        ,{
            view: 'button'
            ,type: 'iconButton'
            ,id: 'dvt:btn:rtl'
            ,label: 'RTL'
            ,icon: 'mdi mdi-home'
            ,tooltip: 'Return home'
            ,autowidth: true
            ,hidden: true
        }

        ,{}

        ,{width: 10}

        // Кнопка меню команд
        ,{view: 'icon', icon: 'mdi mdi-gamepad', popup: 'drone_view_popup_action_menu', id: 'dvt:icon:actions', hidden: true, tooltip: 'Additional controls' }

    ]
};


// Параметры карты
const map_options = {
    fullscreenControl: false
    ,panControl: false
    ,rotateControl: false
    ,streetViewControl: false
    ,scaleControl: false
    ,zoomControlOptions: {
        position: google.maps.ControlPosition.LEFT_BOTTOM
    }
    ,mapTypeControlOptions: {
        position: google.maps.ControlPosition.BOTTOM_LEFT
    }
};
const map_config = {
    view:"google-map",
    localId: "map:drone",
    zoom: 10,
    mapType: 'SATELLITE',
    center:[ 55, 37 ]
};

// Панель с телеметрией
const telemetry_popup = {
    view: 'window'
    ,id: 'drone_view_popup_telemetry'
    ,css: 'transp'
    ,head: false
    ,borderless: true
    ,body: {
        width: 550
        ,borderless: true
        ,css: 'transp'
        ,rows: [
            // telemetry data
            {
                template: function(data){ // TODO назначить сюда контрллер, который выборочно будет показывать телеметрию
                    let template = '';

                    //
                    // Высота
                    template += '<span class="t_elem t_elem_plain" webix_tooltip="Altitude"><span class="webix_icon mdi mdi-arrow-expand-down"></span><span style="width:40px;margin-right:10px">' + (helpers.isNil(data.alt) ? '' : `<b>${data.alt>10?Math.round(data.alt):data.alt.toFixed(1)}</b> m`) + '</span></span>';

                    //
                    // Скорость
                    template += '<span class="t_elem t_elem_plain" webix_tooltip="GPS speed"><span class="webix_icon mdi mdi-speedometer"></span><span style="margin-right:10px">' + (helpers.isNil(data.gps_speed) || isNaN(data.gps_speed) ? '' : `${data.gps_speed} km/h`) + '</span></span>';

                    //
                    // Спутники
                    let sats_bg = 't_elem_plain'
                        ,sats = parseInt(data.sats);
                    if( !helpers.isNil(data.sats) && sats < 5 ) sats_bg = 't_elem_danger';
                    else if( !helpers.isNil(data.sats) && sats < 8 ) sats_bg = 't_elem_warn';
                    template += '<span class="t_elem ' + sats_bg + '" webix_tooltip="Number of visible satellites"><span class="webix_icon mdi mdi-satellite-variant"></span><span style="width:40px;margin-right:10px"><b>' + sats + '</b></span></span>';

                    //
                    // Напряжение
                    template += '<span class="t_elem t_elem_plain" webix_tooltip="Battery voltage"><span class="webix_icon mdi mdi-battery-outline"></span><span style="width:60px;margin-right:10px">' + data.bat_v + '<i>V</i></span></span>';

                    //
                    // Дистанция до точки старта
                    let  dist_home = ''
                        ,dist_home_bg = 't_elem_plain'
                        ,dist_home_tooltip = 'Distance to home. Click to move map on home position'
                        ,dist = parseInt(data.dist_home);

                    if( helpers.isNil(dist) || dist < 0 ){
                        dist_home = 'No home!';
                        dist_home_bg = 't_elem_danger';
                        dist_home_tooltip = 'Home position is not set';
                    }
                    else if( !helpers.isNil(dist) && dist >= 0 ){
                        if( dist > 999 ) dist_home = `${(dist/1000).toFixed(2)} km`;
                        else dist_home = `${dist} m`;
                    }
                    template += '<span class="t_elem ' + dist_home_bg + ' t1_dist_home t_elem_clickable" webix_tooltip="' + dist_home_tooltip + '"><span class="webix_icon mdi mdi-home"></span><span style="width:60px;margin-right:10px">' + dist_home + '</span></span>';


                    return template;
                }
                ,height: 50
                ,localId: 'tpl:telem_top'
                ,data: {
                     sats: ''
                    ,bat_v: ''
                    ,temp: ''
                }
                ,css: 'transp'
                ,onClick:{
                    "t1_dist_home": function(e, id, trg){
                        this.callEvent('clickOnHome');
                        return false; // here it blocks the default behavior
                    }
                }
            }
        ]

    }
};

// Панель с видео и полетными индикаторами
const fi_popup = {
    view: 'window'
    ,id: 'drone_view_popup_fi'
    ,css: 'transp'
    ,head: false
    ,borderless: true
    ,disabled: true
    ,body: {
        width:520
        ,borderless: true
        //,css: 'transp'
        ,rows: [

            // video screen
            {
                view: 'multiview'
                ,width: 520
                ,height: 300
                ,animate: false
                ,css: 'transp_9'
                ,cells: [
                    {
                        template: '<div id="video_player" style="width:500px; height:285px;"></div>'
                        ,view: 'template'
                        ,height: 300
                        ,localId: 'tpl:video_player'
                    }
                    ,{
                        template: '<img src="static/white_noise.gif" class="video_noise_320">'
                        ,height: 300
                        ,localId: 'tpl:video_noise'
                    }
                ]
            }

            // telemetry data
            /*
            ,{
                template: 'X #x1#, Y #y1#'
                ,height: 40
                ,localId: 'tpl:telem_test'
            }
            */

            // Полетные индикаторы
            ,{
                height: 170
                ,css: 'transp_all'
                ,borderless: true
                ,cols: [

                    {}
                    // Горизонт
                    ,{
                        view: 'fi_horizon'
                        ,localId: 'fi:horizon'
                        ,size: 160
                        ,css: 'transp'
                        ,width: 170
                        ,borderless: true
                    }

                    ,{}

                    // Компас
                    ,{
                        view: 'fi_compass'
                        ,localId: 'fi:compass'
                        ,size: 160
                        ,css: 'transp'
                        ,width: 170
                        ,borderless: true
                    }
                    ,{}
                ]
            }

            // Джойстик
            ,{
                borderless: true
                ,localId: 'cont:joystick1'
                ,height: 150
                ,cols: [
                    {}
                    ,{
                        view: 'joystick'
                        ,css: 'transp'
                        ,borderless: true
                    }
                    ,{}
                ]
                //,hidden: true
            }



        ]

    }
};


// Основной вид
const view_config = {
    padding: 0
    ,borderless: true
    ,border: false
    ,localId: 'body'
    ,disabled: true
    ,cols: [
        // map
        map_config

    ]
};
