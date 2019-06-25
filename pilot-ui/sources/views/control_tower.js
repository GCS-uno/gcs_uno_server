import {JetView} from "webix-jet";

import Message from "../plugins/Message";

let top_controls_id = null;

export default class ControlTowerView extends JetView {
    config(){
        return view_config;
    }

    init(view, url){

        top_controls_id = webix.$$('top_view_controls').addView(top_controls);

    }

    ready(view, url){
        // View controls
        const map = this.$$('map:tower');

        // Создание вида после загрузки карты
        map.getMap(true).then(function(mapObj) {
            // Установка параметров карты
            mapObj.setOptions(map_options);
        });
    }

    destroy(){
        if( webix.$$('top_view_controls') && top_controls_id ){
            webix.$$('top_view_controls').removeView(top_controls_id);
        }
    }

}

//
// Кнопки для верхней панели приложения
const top_controls = {
    cols: [

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
    ,localId: "map:tower"
    ,zoom: 10
    ,mapType: 'SATELLITE'
    ,center:[ 55, 37 ]
};

//
// Основная таблица со списком
const view_config = {
    type: 'clean'
    ,rows: [

        {
            cols: [
                map_config
                ,{
                    template: '<img src="static/white_noise.gif" style="width: 100%;height: 100%;padding:0">'
                    ,localId: 'tpl:video_noise'
                    ,padding: 0
                }
            ]
        }
        ,{
            cols: [
                {
                    rows: [
                        { view: 'template', type: 'header', template: 'Drones'}
                        ,{
                            view: 'list'
                            ,gravity: 1
                            ,select: true
                            ,template: function(obj){
                                let tpl = '';
                                let bgcolor = 'rgb(255,255,255)';
                                if( obj.warn ){
                                    bgcolor = 'rgba(255,0,0,0.2)';
                                }
                                tpl += `<div style="background-color: ${bgcolor}">`;
                                tpl += `<div style="padding: 3px;display: block;height: 30px"><div style="float:left;width: 100px;overflow: hidden;"><b>${obj.name}</b></div><div style="width: 100px;float:right;text-align: right"><i>${obj.status}</i></div></div>`;
                                tpl += '<div style="padding: 3px;display: block;height: 30px;opacity: 0.5">';
                                tpl += `<span class="webix_icon mdi mdi-arrow-expand-down"></span><span style="width:40px;margin-right:10px">${obj.alt} m</span>`;
                                tpl += `<span class="webix_icon mdi mdi-speedometer"></span><span style="width:40px;margin-right:10px">${obj.spd} km/h</span>`;

                                let bat_icon = 'battery';
                                if( 'Charging' === obj.status ){
                                    if( obj.bat <= 10 ) bat_icon = 'battery-charging-10';
                                    else if( obj.bat <= 20 ) bat_icon = 'battery-charging-20';
                                    else if( obj.bat <= 30 ) bat_icon = 'battery-charging-30';
                                    else if( obj.bat <= 40 ) bat_icon = 'battery-charging-40';
                                    else if( obj.bat <= 50 ) bat_icon = 'battery-charging-50';
                                    else if( obj.bat <= 60 ) bat_icon = 'battery-charging-60';
                                    else if( obj.bat <= 70 ) bat_icon = 'battery-charging-70';
                                    else if( obj.bat <= 80 ) bat_icon = 'battery-charging-80';
                                    else if( obj.bat <= 90 ) bat_icon = 'battery-charging-90';
                                    else if( obj.bat <= 100 ) bat_icon = 'battery-charging-100';
                                }
                                else {
                                    if( obj.bat <= 10 ) bat_icon = 'battery-10';
                                    else if( obj.bat <= 20 ) bat_icon = 'battery-20';
                                    else if( obj.bat <= 30 ) bat_icon = 'battery-30';
                                    else if( obj.bat <= 40 ) bat_icon = 'battery-40';
                                    else if( obj.bat <= 50 ) bat_icon = 'battery-50';
                                    else if( obj.bat <= 60 ) bat_icon = 'battery-60';
                                    else if( obj.bat <= 70 ) bat_icon = 'battery-70';
                                    else if( obj.bat <= 80 ) bat_icon = 'battery-80';
                                    else if( obj.bat <= 90 ) bat_icon = 'battery-90';
                                    else if( obj.bat <= 100 ) bat_icon = 'battery';
                                }
                                tpl += `<span class="webix_icon mdi mdi-${bat_icon}"></span><span style="width:40px;margin-right:10px">${obj.bat}%</span>`;
                                tpl += '</div>';
                                tpl += '</div>';

                                return tpl;
                            }
                            ,type: {
                                height: 80
                            }
                            ,data: [
                                { id: 1, name: 'Copter 1', status: 'Flying', alt: 50, spd: 24, bat: 76, warn: 0 }
                                ,{ id: 2, name: 'Copter 2', status: 'Flying', alt: 30, spd: 36, bat: 50, warn: 0 }
                                ,{ id: 3, name: 'Copter 3', status: 'Charging', alt: 0, spd: 0, bat: 23, warn: 0 }
                                ,{ id: 4, name: 'Copter 4', status: 'Failsafe RTL', alt: 15, spd: 20, bat: 76, warn: 1 }
                            ]
                        }
                    ]
                }
                ,{
                    rows: [
                        { view: 'template', type: 'header', template: 'Charging stations'}
                        ,{
                            view: 'list'
                            ,gravity: 1
                            ,select: true
                            ,template: function(obj){
                                let tpl = '';
                                let down_op = '1';
                                if( obj.warn === 2 ){
                                    down_op = '0.7';
                                }
                                tpl += `<div style="opacity: ${down_op}">`;
                                tpl += `<div style="padding: 3px;display: block;height: 30px"><div style="float:left;width: 100px;overflow: hidden;"><b>${obj.name}</b></div><div style="width: 100px;float:right;text-align: right"><i>${obj.status}</i></div></div>`;
                                tpl += '<div style="padding: 3px;display: block;height: 30px;opacity: 0.5">';
                                tpl += `<span class="webix_icon mdi mdi-weather-windy"></span><span style="width:40px;margin-right:10px">${obj.wind}</span>`;
                                tpl += `<span class="webix_icon mdi mdi-thermometer-lines"></span><span style="width:40px;margin-right:10px">${obj.temp}°C</span>`;
                                tpl += '</div>';
                                tpl += '</div>';

                                return tpl;
                            }
                            ,type: {
                                height: 80
                            }
                            ,data: [
                                 { id: 1, name: 'Station A', status: 'Ready', wind: '2 m/s NW', temp: 12, warn: 0 }
                                ,{ id: 2, name: 'Station B', status: 'Charging', wind: '12 m/s NNW', temp: 12, warn: 0 }
                                ,{ id: 3, name: 'Station C', status: 'Down', wind: '--', temp: '--', warn: 2 }
                            ]
                        }
                    ]
                }
                , {
                    rows: [
                        {view: 'template', type: 'header', template: 'Emergency Events'}
                        ,{
                            view: 'list'
                            ,template: '#time#  <b>#obj#</b>: #ev#'
                            ,data: [
                                {id: 1, time: '10:22:44', obj: 'Copter 4', ev: 'Datalink down, RTL triggered'}
                                ,{id: 2, time: '10:20:03', obj: 'Station C', ev: 'Gone offline'}
                                ,{id: 3, time: '10:12:27', obj: 'Copter 1', ev: 'Preflight checklist failed'}
                            ]
                        }
                    ]
                }
            ]
        }
    ]

};

