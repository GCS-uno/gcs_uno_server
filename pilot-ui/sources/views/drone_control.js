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
        this.log_dl_popup = this.ui(log_download_popup);
            webix.extend(this.log_dl_popup, webix.ProgressBar);

        this.logs_list_popup = this.ui(logs_list_popup);
        this.params_list_popup = this.ui(params_list_popup);

        top_controls_id = webix.$$('top_view_controls').addView(top_controls);

        webix.TooltipControl.addTooltip(this.telemetry_popup.$view);

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
    ,zIndex: 6
    ,body: {
        width:300
        ,padding: 10
        ,rows: [
            // Серво
            {
                padding: 20
                ,rows: [
                     { view: "slider", value: 0, label: "Servo 5",localId: 'sw:ser5', min: 0, max: 20, title:webix.template("#value#") }
                    ,{ view: "slider", value: 0, label: "Servo 6",localId: 'sw:ser6', min: 0, max: 20, title:webix.template("#value#") }
                    ,{ view: "switch", value: 0, label: "Servo 7",localId: 'sw:ser7' }
                    ,{ view: "switch", value: 0, label: "Servo 8",localId: 'sw:ser8' }
                ]
            }

            // Реле
            ,{
                padding: 20
                ,rows: [
                    { view: "switch", value: 0, label: "Relay 1",localId: 'sw:rel1' }
                    ,{ view: "switch", value: 0, label: "Relay 2",localId: 'sw:rel2' }
                    ,{ view: "switch", value: 0, label: "Relay 3",localId: 'sw:rel3' }
                    ,{ view: "switch", value: 0, label: "Relay 4",localId: 'sw:rel4' }
                ]
            }

            // Кнопка Загрузить полетный план с борта
            ,{
                view: 'button'
                ,type: 'iconButton'
                ,localId: 'btn:get_mission'
                ,label: 'Download mission'
                ,icon: 'mdi mdi-download'
            }

            // Список лог файлов
            ,{
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
                        templ += 'Status: <b>' + (parseInt(data.online) === 1 ? `online (${data.sys_status})`  : 'offline'  ) + '</b><br/>';
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

// Окошко со статусом загрузки логфайла
const log_download_popup = {
    view: 'window'
    ,id: 'drone_view_popup_log_dl'
    ,headHeight: 0
    ,head: false
    ,borderless: true
    ,position: 'center'
    ,zIndex: 1000
    ,body: {
        padding: 20
        ,width: 300
        //,height: 150
        ,rows: [
            { localId: 'tpl:log_msg', borderless: true, template: function(data){
                    if( !data.status ) return '';

                    if( 'pend' === data.status && data.c ){
                        return    '<div class="log_report_popup">Downloading log file #<b>' + data.id + '</b></div>'
                                + '<div class="log_report_popup">' + data.c.p + '% of ' + data.c.s + ' @ ' + data.c.sp + '/sec</div>'
                                + '<div class="log_report_popup">Remaining time: ' + data.c.tr + '</div>';
                    }
                    else return data.msg;

                }}
            ,{
                cols: [
                    { view: 'button', label: 'Stop downloading', type: 'iconButton', icon: 'mdi mdi-cancel', localId: 'btn:stop', hidden: true }
                    ,{ view: 'button', label: 'View log', type: 'iconButton', icon: 'mdi mdi-file-table', localId: 'btn:view', hidden: true }
                    ,{ view: 'button', label: 'Close', type: 'iconButton', icon: 'mdi mdi-close', localId: 'btn:close', hidden: true, click: function(){ this.getTopParentView().hide();}}
                ]
            }
        ]
    }
};

// Окошко со списком бортовых лог файлов
const logs_list_popup = {
    view: 'window'
    ,id: 'drone_view_popup_logs_list'
    //,headHeight: 0
    ,head: 'Board log files'
    ,borderless: true
    ,position: 'center'
    ,zIndex: 1000
    ,body: {
        padding: 10
        ,width: 500
        ,rows: [
            {
                view: 'datatable'
                ,localId: 'dtb:logs_list'
                ,height: 300
                ,columns: [
                    { id: 'id', header: '#', width: 50 },
                    { id: 'ts', header: 'Time', fillspace: true, format: function(ts){
                        let d = new Date();
                        d.setTime(ts);
                        return webix.Date.dateToStr("%Y-%m-%d %H:%i")(d);
                    } },
                    { id: 'sz', header: 'Size', width: 100 },
                    { id: 'btn', header: '', width: 80, template: function(row){
                            if( row.s === 'v' ) return '<span class="act_view" style="text-decoration: underline;cursor: pointer" title="View downloaded log file">view</span>';
                            if( row.s === 'dl' ) return (row.hasOwnProperty('dp') ? row.dp + '% ' : '') + '<span class="webix_icon mdi mdi-close-circle act_canc" title="Stop downloading" style="cursor:pointer"></span>';
                            if( row.s === 'pr' ) return 'parsing';
                            if( row.s === 'q' ) return 'wait  <span class="webix_icon mdi mdi-close-circle act_canc_q" title="Stop downloading" style="cursor:pointer"></span>';
                            else return '&nbsp;<span class="webix_icon mdi mdi-download-outline act_dl" title="Download" style="cursor:pointer"></span>';
                        } }
                ]
                ,onClick: {
                     act_view: function(ev, id, html){
                        this.callEvent('clickOnView', [id.toString()]);
                    }
                    ,act_dl: function(ev, id, html){
                        this.callEvent('clickOnDL', [id.toString()]);
                    }
                    ,act_canc: function(ev, id, html){
                        this.callEvent('clickOnCancel', [id.toString()]);
                    }
                    ,act_canc_q: function(ev, id, html){
                        this.callEvent('clickOnCancelQ', [id.toString()]);
                    }
                }
            }
            ,{
                cols: [
                    { view: 'button', label: 'Erase all', type: 'iconButton', icon: 'mdi mdi-delete', localId: 'btn:erase' }
                    ,{width: 10}
                    ,{ view: 'button', label: 'Refresh', type: 'iconButton', icon: 'mdi mdi-refresh', localId: 'btn:refresh' }
                    ,{width: 10}
                    ,{ view: 'button', label: 'Close', type: 'iconButton', icon: 'mdi mdi-close', click: function(){ this.getTopParentView().hide(); } }
                ]
            }
        ]
    }
};

// Окошко со списком бортовых параметров
const params_list_popup = {
    view: 'window'
    ,id: 'drone_view_popup_params_list'
    ,head: 'Board parameters'
    ,borderless: true
    ,position: 'center'
    ,zIndex: 1000
    ,body: {
        padding: 10
        ,width: 500
        ,height: 400
        ,rows: [
            // TABs
            {
                view: 'tabbar'
                ,value: 'params_cur'
                ,multiview: true
                ,localId: 'tb:params_tab'
                ,options: [
                     { value: 'Full list', id: 'params_cur' }
                    ,{ value: 'Unsaved (0)', id: 'params_save' }
                ]
            }

            // Cells
            , {
                animate: false
                , cells: [
                    {
                        view: 'datatable'
                        ,id: 'params_cur'
                        ,localId: 'dtb:params_list'
                        ,editable: true
                        ,select: true
                        ,columns: [
                            { id: 'id', header: ['Param ID', {content: 'textFilter', colspan: 2}], sort:"string", fillspace: 1 },
                            { id: 'val', header: {text: 'Value', css:{'text-align':'right'}}, fillspace: 1, editor: "text", css:{'text-align':'right'} }
                        ]
                    }
                    ,{
                        view: 'datatable'
                        ,id: 'params_save'
                        ,localId: 'dtb:params_list_save'
                        ,select: true
                        ,columns: [
                             { id: 'id', header: 'Param ID', fillspace: 1 }
                            ,{ id: 'o_val', header: {text: 'Old Value', css:{'text-align':'right'}}, fillspace: 1, css:{'text-align':'right'} }
                            ,{ id: 'n_val', header: {text: 'New Value', css:{'text-align':'right'}}, fillspace: 1, css:{'text-align':'right'} }
                            ,{ id: 'canc_icon', header: '', width: 50, css:{'text-align':'center'}, template: '<span class="webix_icon mdi mdi-close-circle act_canc" title="Cancel changes" style="cursor:pointer"></span>' }
                        ]
                        ,onClick: {
                            act_canc: function (ev, id, html) {
                                this.callEvent('clickCancel', [id.toString()]);
                            }
                        }
                    }
                ]
            }
            ,{
                cols: [
                     { view: 'button', label: 'Save', type: 'iconButton', icon: 'mdi mdi-content-save', localId: 'btn:save' }
                    ,{ width: 10 }
                    ,{ view: 'button', label: 'Close', type: 'iconButton', icon: 'mdi mdi-close', click: function(){ this.getTopParentView().hide(); } }
                ]
            }
        ]
    }
};


//
// Кнопки для верхней панели
const top_controls = {
    cols: [
        //,{ view: 'button', type: 'iconButton', icon: 'mdi mdi-settings', label: 'Setup your drone', width: 200, id: 'dvt:btn:setup', css: 'button_primary button_raised', hidden: true}

        // Кнопка с информацией
        { view: 'icon', id: 'dvt:icon:info', icon: 'mdi mdi-information', popup: 'drone_view_popup_info', tooltip: 'Drone info' }

        // Drone offline label
        ,{view: 'label', id: 'dvt:tpl:offline', label: 'drone offline', borderless: true, hidden: true, width: 150, css: "header_label" }

        // Кнопка со списком статусов
        ,{ view: 'icon', id: 'dvt:icon:statuses', icon: 'mdi mdi-bullhorn', popup: 'drone_view_popup_statuses', hidden: true, tooltip: 'Statuses' }
        ,{ width: 20 }

        // Flight mode set status
        ,{
            view: 'richselect'
            ,id: 'dvt:rs:mode'
            ,labelWidth: 0
            ,width: 200
            ,options: []
            ,hidden: true
            ,tooltip: 'Set flight mode'
            ,zIndex: 1500
        }
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

        // Кнопка Mode Loiter
        ,{
            view: 'button'
            ,type: 'iconButton'
            ,id: 'dvt:btn:md_loiter'
            ,label: 'MD LOIT'
            ,icon: 'mdi mdi-alert'
            ,tooltip: 'DANGER!! Do not click if you have no RC! For testing only'
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
    view:"google-map"
    ,localId: "map:drone"
    ,zoom: 10
    ,mapType: 'SATELLITE'
    ,center:[ 55, 37 ]
    ,zIndex: 1
};

// Панель с телеметрией сверху карты
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

// Панель с видео, полетными индикаторами и джойстиками
const fi_popup = {
    view: 'window'
    ,id: 'drone_view_popup_fi'
    ,css: 'transp'
    ,head: false
    ,borderless: true
    ,disabled: true
    ,zIndex: 5
    ,body: {
        width:520
        ,borderless: true
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

            // Переключатели источника видео
            ,{
                cols: [
                    {
                        view: 'segmented'
                        ,localId: 'switch:video_src'
                        ,value: 1
                        ,options: [
                             { id: 1, value: 'Camera 1' }
                            ,{ id: 2, value: 'Camera 2' }
                            ,{ id: 3, value: 'Camera 3' }
                        ]
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

            // Джойстики
            ,{
                cols: [
                    {
                        borderless: true
                        ,localId: 'cont:joystick1'
                        ,height: 150
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
                    ,{
                        borderless: true
                        ,localId: 'cont:joystick2'
                        ,height: 150
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
    ,disabled: true
    ,cols: [
        // map
        map_config

    ]
};
