import {JetView} from "webix-jet";
import helpers from '../../../utils/helpers';
import DronesCollection from "../models/DronesCollection";


let top_controls_id = null;


export default class DJIDroneView extends JetView {

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

        top_controls_id = webix.$$('top_view_controls').addView(top_controls);

    }

    ready(view, url){

        const _this = this;
        const map = this.$$('map:drone');
        const top_toolbar = webix.$$('top_toolbar');

        // Создание вида после загрузки карты
        map.getMap(true).then(function(mapObj) {

            // Установка параметров карты
            mapObj.setOptions(map_options);

            // Включить панель с полетными инструментами
            _this.fi_popup.show({y:60, x: (top_toolbar.$width - 530)});

            // Включить джойстики
            _this.fi_popup.queryView({j_id: 'j_left'}).showJoystick();
            _this.fi_popup.queryView({j_id: 'j_right'}).showJoystick();
            _this.fi_popup.queryView({j_id: 'j_gimb'}).showJoystick();

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
            if( drone_item.type !== "dji" ){
                _this.app.show('/app/drones_list');
                return;
            }

            // Сделать в заголовке ссылку на список и добавить название дрона
            _this.app.getService('topTitle').update([{text: 'Drones', link: '/app/drones_list'}, {text: drone_item.name}]);

            // Запустить для дрона активный вид
            DronesCollection.Drones[drone_id].view_start(view);

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
    view:"google-map"
    ,localId: "map:drone"
    ,zoom: 10
    ,mapType: 'SATELLITE'
    ,center:[ 55, 37 ]
    ,zIndex: 1
};

// Меню с кнопками управления
const action_menu_popup = {
    view: 'popup'
    ,id: 'drone_view_popup_action_menu'
    ,zIndex: 6
    //,css: "webix_dark"
    ,body: {
        width:300
        ,padding: 10
        ,rows: [

            // Список лог файлов
            {
                view: 'button'
                ,type: 'iconButton'
                ,localId: 'btn:get_logs_list'
                ,label: 'Board logs list'
                ,icon: 'mdi mdi-file-table'
            }

            // Кнопка окна бортовых параметров
            ,{
                view: 'button'
                ,type: 'iconButton'
                ,localId: 'btn:params_list'
                ,label: 'Board parameters'
                ,icon: 'mdi mdi-settings'
            }

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
                        templ += 'Status: <b>' + (parseInt(data.online) === 1 ? 'online'  : 'offline'  ) + '</b><br/>';
                        if( parseInt(data.online) === 1 ) {
                            templ += 'Uptime: ' + helpers.readable_seconds(data.uptime) + '<br/>';
                            templ += '';
                        }
                        else {
                            templ += 'Downtime: ' + helpers.readable_seconds(data.downtime) + '<br/>';
                            if( parseFloat(data.last_pos_lat) && parseFloat(data.last_pos_lon) ){
                                templ += 'Last postion: ' + data.last_pos_lat + ', ' + data.last_pos_lon + '<br/>';
                            }
                            else {
                                templ += 'Last position unknown<br/>';
                            }
                        }
                        templ += 'Model: ' + ( data.model ? data.model : 'unknown' ) + ', sn: ' + ( data.sn ? data.sn : 'unknown' ) + '<br/>';
                        templ += '';
                    }

                    return templ;
                }
                ,localId: 'tpl:info'
                ,height: 80
                ,borderless: true
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
    ,zIndex: 2000
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

// Кнопки для верхней панели
const top_controls = {
    cols: [

        // Кнопка со списком статусов
        { view: 'icon', id: 'dvt:icon:statuses', icon: 'mdi mdi-bullhorn', popup: 'drone_view_popup_statuses', hidden: true, tooltip: 'Statuses' }
        ,{ width: 10 }

        // Кнопка с информацией
        ,{ view: 'icon', id: 'dvt:icon:info', icon: 'mdi mdi-information', popup: 'drone_view_popup_info', tooltip: 'Drone info' }

        // Drone offline label
        ,{view: 'label', id: 'dvt:tpl:offline', label: 'drone offline', borderless: true, hidden: true, width: 150, css: "header_label" }
        ,{ width: 20 }

        // Название полетного режима для коптера
        ,{view: 'label', label: 'Mode: ', width: 150, id: 'dvt:lbl:mode', hidden: true }
        ,{ width: 20 }

        // Label armed / disarmed
        ,{view: 'label', label: '', width: 80, id: 'dvt:lbl:armed', hidden: true }

        // ARM / DISARM кнопки
        ,{view: 'button', value: 'ARM', id: 'dvt:btn:arm', width: 100, hidden: true, tooltip: 'Activate motors' }
        ,{view: 'button', value: 'DISARM', id: 'dvt:btn:disarm', type: 'danger', width: 100, hidden: true, tooltip: 'Deactivate motors'}

        // Кнопка Mode Guided
        ,{
            view: 'button'
            ,type: 'iconButton'
            ,id: 'dvt:btn:md_guided'
            ,label: 'Guided'
            ,icon: 'mdi mdi-ship-wheel'
            ,tooltip: 'Switch to GUIDED mode'
            ,autowidth: true
            ,hidden: true
        }

        // Кнопка команды Loiter unlimited
        ,{
            view: 'button'
            ,type: 'iconButton'
            ,id: 'dvt:btn:cm_loiter'
            ,label: 'Loiter'
            ,icon: 'mdi mdi-ship-wheel'
            ,tooltip: 'Send Loiter Unlimited command'
            ,autowidth: true
            ,hidden: true
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

        // Кнопка меню доп функций
        ,{view: 'icon', icon: 'mdi mdi-dots-horizontal', popup: 'drone_view_popup_action_menu', id: 'dvt:icon:actions', hidden: true, tooltip: 'Additional controls' }
    ]
};

// Панель с телеметрией сверху карты
const telemetry_popup = {
    view: 'window'
    ,id: 'popup_telemetry'
    ,css: 'transp'
    ,head: false
    ,borderless: true
    ,body: {
        width: 550
        ,borderless: true
        ,css: 'transp'
        ,cols: [
            {
                view: 'telem_widget'
                ,localId: 'tw:mapCenter'
                ,icon: 'crosshairs-gps'
                ,label: false
                ,value: false
                ,clickable: true
                ,state: "active"
                ,tooltip: 'Center drone on map'
                ,width: 40
            }
            ,{
                view: 'telem_widget'
                ,localId: 'tw:alt'
                ,icon: 'arrow-expand-down'
                ,label: 'm'
                ,tooltip: 'Altitude'
                ,width: 100
            }
            ,{
                view: 'telem_widget'
                ,localId: 'tw:speed'
                ,icon: 'speedometer'
                ,label: 'kph'
                ,tooltip: 'Ground speed'
                ,width: 100
            }
            ,{
                view: 'telem_widget'
                ,localId: 'tw:sats'
                ,icon: 'satellite-variant'
                ,label: false
                ,tooltip: 'Satellites visible'
                ,width: 65
            }
            ,{
                view: 'telem_widget'
                ,localId: 'tw:bat_r'
                ,icon: 'battery'
                ,label: '%'
                ,tooltip: 'Remaining battery'
                ,width: 80
            }
        ]
    }
};

// Панель с видео, полетными индикаторами и джойстиками
const fi_popup = {
    view: 'window'
    ,id: 'drone_view_popup_fi'
    ,css: 'transp' // highZ
    ,head: false
    ,borderless: true
    //,disabled: true
    ,zIndex: 5
    ,body: {
        width:520
        ,borderless: true
        ,rows: [

            // video screen
            { borderless: true, padding: 0, template: '<div id="video_player" style="width:500px; height:282px;padding:0;margin:0;background-color:#000"></div>', height: 292 }


            // Переключатели источника видео
            ,{
                cols: [
                    {
                        view: 'segmented'
                        ,localId: 'switch:video_src'
                        ,value: 1
                        ,options: [
                             { id: 1, value: 'Cam 1' }
                            ,{ id: 2, value: 'Cam 2' }
                            ,{ id: 3, value: 'Cam 3' }
                        ]
                        ,width: 240
                    }
                    ,{
                        cols: [
                            {}
                            ,{
                                view: 'button'
                                ,type: 'iconButton'
                                ,id: 'test32434'
                                //,label: 'Photo'
                                ,icon: 'mdi mdi-camera'
                                ,tooltip: 'Take photo'
                                ,width: 40
                            }
                            ,{
                                view: 'button'
                                ,type: 'iconButton'
                                ,id: 'test32432'
                                //,label: 'Video'
                                ,icon: 'mdi mdi-video'
                                ,tooltip: 'Start video recording'
                                ,width: 40
                            }
                        ]
                    }
                ]
            }

            // Полетные индикаторы
            ,{
                height: 150
                ,css: 'transp_all'
                ,borderless: true
                ,cols: [

                    {width: 10}
                    // Горизонт
                    ,{
                        view: 'fi_horizon'
                        ,localId: 'fi:horizon'
                        ,size: 140
                        ,css: 'transp'
                        ,width: 150
                        ,borderless: true
                    }

                    ,{gravity:1}

                    // Компас
                    ,{
                        view: 'fi_compass'
                        ,localId: 'fi:compass'
                        ,size: 140
                        ,css: 'transp'
                        ,width: 150
                        ,borderless: true
                    }

                    ,{gravity:1}

                    // Радар
                    ,{
                        rows: [
                            {
                                view:"chart",
                                type:"radar",
                                width: 150,
                                height: 120,
                                padding: 0,
                                css: {"padding":"10px 0"},
                                value:"#dis#",
                                borderless: true,
                                preset:"area",
                                disableItems: true,
                                xValue: '#dir#',
                                yValue: '#dis#',
                                fill: 'rgba(0,209,25,1)',
                                line: {color: '#ff0309'},
                                xAxis:{
                                    template: '',
                                    lines: true,
                                    lineColor:"#A5A5A5"
                                },
                                yAxis:{
                                    lines: true
                                    ,lineColor:"#A5A5A5"
                                    ,template: ''
                                    ,lineShape: 'arc'
                                    ,bg: '#cccccc'
                                    ,start: 1
                                    ,end: 10
                                    ,step: 1
                                }
                                ,data: [
                                    {dir: 0, dis: 6}
                                    ,{dir: 1, dis: 8}
                                    ,{dir: 2, dis: 10}
                                    ,{dir: 3, dis: 8}
                                    ,{dir: 4, dis: 10}
                                    ,{dir: 5, dis: 8}
                                    ,{dir: 6, dis: 7}
                                    ,{dir: 7, dis: 8}
                                ]
                            }
                            ,{height:5}
                        ]
                    }

                    ,{width: 10}
                ]
            }

            // Джойстики
            ,{
                cols: [
                    {width: 10}

                    // Левый
                    ,{
                        borderless: true
                        ,localId: 'cont:joystick1'
                        ,height: 140
                        ,cols: [
                            {}
                            ,{
                                view: 'joystick'
                                ,css: 'transp'
                                ,borderless: true
                                ,j_id: 'j_left'
                            }
                            ,{}
                        ]
                    }

                    ,{gravity:1}

                    // Правый
                    ,{
                        borderless: true
                        ,localId: 'cont:joystick2'
                        ,height: 140
                        ,cols: [
                            {}
                            ,{
                                view: 'joystick'
                                ,css: 'transp'
                                ,borderless: true
                                ,j_id: 'j_right'
                            }
                            ,{}
                        ]
                    }

                    ,{gravity:1}

                    // Подвес камеры
                    ,{
                        borderless: true
                        ,localId: 'cont:joystick3'
                        ,height: 140
                        ,cols: [
                            {}
                            ,{
                                view: 'joystick'
                                ,css: 'transp'
                                ,borderless: true
                                ,j_id: 'j_gimb'
                                ,color: 'blue'
                            }
                            ,{}
                        ]
                    }

                    ,{width: 10}
                ]
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
    //,disabled: true
    //,css: 'webix_dark'
    ,cols: [
        // map
        map_config

    ]
};
