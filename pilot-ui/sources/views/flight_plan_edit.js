import {JetView} from "webix-jet";
import DroneChoose from '../views/popups/drone_choose';
import FlightPlansCollection from "../models/FlightPlansCollection";



// Элементы управления для верхней панели
const top_controls = {
    cols: [
        {gravity:4}

        // Шаблон % от загрузки полетного плана
        ,{
            view: 'template'
            ,id: 'FPTE:tpl:progress'
            ,template: 'Uploading #progress#%'
            ,data: {progress: 0}
            ,hidden: true
            ,borderless: true
        }

        // Кнопка загрузить полетный план
        ,{
            view: 'icon'
            ,type: 'iconButton'
            ,id: 'FPTE:btn:upload'
            ,icon: 'mdi mdi-upload'
            ,tooltip: 'Upload flight plan to autopilot'
        }

        // Кнопка Удалить полетный план
        ,{
            view: 'icon'
            ,type: 'iconButton'
            ,id: 'FPTE:btn:trash'
            ,icon: 'mdi mdi-delete'
            ,tooltip: 'Remove this flight plan'
        }
    ]
};


// Форма параметров полетного задания
const mission_form = {
    view: 'form'
    ,borderless: true
    ,localId: 'mission:form'
    ,elementsConfig:{
        labelWidth: 100
    }
    ,rows: [
        { view: 'text', name: 'name', label: 'Name', placeholder: 'Name you flight plan' }
        ,{ view: 'text', name: 'location', label: 'Location' }
    ]
};


// Форма параметров точки
const item_subview = {
    padding: 0
    ,borderless: true
    ,layout: 'clean'
    ,rows: [

        // мультивид с формами для редактирования команд
        {
            view: 'multiview'
            //,fitBiggest: true
            ,animate: false
            ,padding: 0
            ,borderless: true
            ,cells: [

                // Форма редактирования домашней точки
                {
                    localId: 'item_view_home'
                    ,height: 70
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            ,elementsConfig:{
                                labelWidth: 130
                            }
                            ,elements:[
                                { view: 'checkbox', name: 'rtl_end', labelRight: "Return to launch at end", value:0, labelWidth: 0, width: 200 }
                            ]
                        }

                    ]
                }


                // Форма редактирования маршрутной точки
                ,{
                    localId: 'item_view_16'
                    //,height: 200
                    //,borderless: true
                    //,css: 'transp'
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            //,css: 'transp'
                            ,elementsConfig:{
                                labelWidth: 110
                            }
                            ,elements:[
                                //{ view: 'richselect', name: 'command_group', options: [{id: 'waypoint', value: 'Nav to waypoint'},{id: 'loiter', value: 'Loiter'},{id: 'land', value: 'Land'}], labelWidth: 0, label: ''}

                                { view: 'radio', name: 'command_group', options: [{id: 'waypoint', value: 'Nav to waypoint'},{id: 'loiter', value: 'Loiter'},{id: 'land', value: 'Land'}], label: 'Action'}


                                ,{ view: 'counter', name: 'param7', label: 'Alt, m', value: 0 }
                                ,{ view: 'radio', name: 'frame', value: 1, label: 'Relative to', options: [{id: 3, value: "home"}, {id: 10, value: "terrain"}, {id: 0, value: "sea level"}], vertical: false }
                                //,{ view: 'counter', name: 'speed', label: 'Speed, kph', value: 0, title: 'At what speed pass the point', min: 0, max: 1000 }
                                ,{ view: 'counter', name: 'param1', label: 'Hold, sec', value: 0, title: 'Hold at this point before going to the next one', min: 0, max: 1000 }
                            ]
                        }
                    ]
                }

                // Loiter unlimited
                ,{
                    localId: 'item_view_17'
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            ,elementsConfig:{
                                labelWidth: 110
                            }
                            ,elements:[
                                { view: 'radio', name: 'command_group', options: [{id: 'waypoint', value: 'Nav to waypoint'},{id: 'loiter', value: 'Loiter'},{id: 'land', value: 'Land'}], label: 'Action'}

                                ,{ view: 'radio', name: 'command', value: '17', label: 'Loiter', options: [{id: '17', value: "unlimited"}, {id: '18', value: "turns"}, {id: '19', value: "time"}, {id: '31', value: "alt"}], vertical: false  }

                                ,{ view: 'counter', name: 'param7', label: 'Alt, m', value: 0 }
                                ,{ view: 'counter', name: 'param3', label: 'Radius, m', value: 0, min: -200, max: 200, tooltip: 'Positive - CW, Negative - CCW' }
                            ]
                        }
                    ]
                }

                // Loiter turns
                ,{
                    localId: 'item_view_18'
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            ,elementsConfig:{
                                labelWidth: 110
                            }
                            ,elements:[
                                { view: 'radio', name: 'command_group', options: [{id: 'waypoint', value: 'Nav to waypoint'},{id: 'loiter', value: 'Loiter'},{id: 'land', value: 'Land'}], label: 'Action'}

                                ,{ view: 'radio', name: 'command', value: 18, label: 'Loiter', options: [{id: 17, value: "unlimited"}, {id: 18, value: "turns"}, {id: 19, value: "time"}, {id: 31, value: "alt"}], vertical: false  }

                                ,{ view: 'counter', name: 'param7', label: 'Alt, m', value: 0 }
                                ,{ view: 'counter', name: 'param1', label: 'Turns', min: 0, max: 1000, tooltip: 'How many turns to make' }
                                ,{ view: 'counter', name: 'param3', label: 'Radius, m', value: 0, min: -200, max: 200, tooltip: 'Positive - CW, Negative - CCW' }
                            ]
                        }
                    ]
                }

                // Loiter time
                ,{
                    localId: 'item_view_19'
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            ,elementsConfig:{
                                labelWidth: 110
                            }
                            ,elements:[
                                { view: 'radio', name: 'command_group', options: [{id: 'waypoint', value: 'Nav to waypoint'},{id: 'loiter', value: 'Loiter'},{id: 'land', value: 'Land'}], label: 'Action'}

                                ,{ view: 'radio', name: 'command', value: 19, label: 'Loiter', options: [{id: 17, value: "unlimited"}, {id: 18, value: "turns"}, {id: 19, value: "time"}, {id: 31, value: "alt"}], vertical: false  }

                                ,{ view: 'counter', name: 'param7', label: 'Alt, m', value: 0 }
                                ,{ view: 'counter', name: 'param1', label: 'Time, sec', value: 0, min: 0, max: 1000, tooltip: 'How many turns to make' }
                                ,{ view: 'counter', name: 'param3', label: 'Radius, m', value: 0, min: -200, max: 200, tooltip: 'Positive - CW, Negative - CCW' }
                            ]
                        }
                    ]
                }

                // Loiter alt
                ,{
                    localId: 'item_view_31'
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            ,elementsConfig:{
                                labelWidth: 110
                            }
                            ,elements:[
                                { view: 'radio', name: 'command_group', options: [{id: 'waypoint', value: 'Nav to waypoint'},{id: 'loiter', value: 'Loiter'},{id: 'land', value: 'Land'}], label: 'Action'}

                                ,{ view: 'radio', name: 'command', label: 'Loiter', options: [{id: 17, value: "unlimited"}, {id: 18, value: "turns"}, {id: 19, value: "time"}, {id: 31, value: "alt"}], vertical: false  }

                                ,{ view: 'counter', name: 'param7', label: 'Alt, m', value: 0 }
                                ,{ view: 'counter', name: 'param2', label: 'Radius, m', value: 0, min: -200, max: 200, tooltip: 'Positive - CW, Negative - CCW' }

                            ]
                        }
                    ]
                }



                // Land
                ,{
                    localId: 'item_view_21'
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            //,css: 'transp'
                            ,elementsConfig:{
                                labelWidth: 110
                            }
                            ,elements:[
                                { view: 'radio', name: 'command_group', options: [{id: 'waypoint', value: 'Nav to waypoint'},{id: 'loiter', value: 'Loiter'},{id: 'land', value: 'Land'}], label: 'Action'}

                                ,{ template: 'Land at this point', height: 40, borderless: true }
                            ]
                        }
                    ]
                }

                // Takeoff
                ,{
                    localId: 'item_view_22'
                    //,height: 200
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            //,css: 'transp'
                            ,elementsConfig:{
                                labelWidth: 130
                            }
                            ,elements:[
                                { view: 'counter', name: 'param7', label: 'Takeoff to alt, m', min: 1, max: 1000 }
                            ]
                        }
                    ]
                }


                // Change speed
                ,{
                    localId: 'item_view_178'
                    //,height: 200
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            //,css: 'transp'
                            ,elementsConfig:{
                                labelWidth: 110
                            }
                            ,elements:[
                                { view: 'counter', name: 'param2', label: 'Speed, m/s', min: -1, max: 200, tooltip: 'Speed in meters per second. Set -1 for no change' }
                                ,{ view: 'radio', name: 'param1', label: 'Type', options: [{id: 0, value: 'Airspeed'}, {id: 1, value: 'Ground speed'}], tooltip: 'Type of speed' }
                                ,{ view: 'counter', name: 'param3', label: 'Throttle %', min: -1, max: 100, tooltip: 'Throttle in % (0-100). Set -1 for no change' }
                                ,{ view: 'radio', name: 'param4', label: 'Rel', options: [{id: 0, value: 'Absolute'}, {id: 1, value: 'Relative'}], tooltip: '' }
                            ]
                        }
                    ]
                }


                // Set relay
                ,{
                    localId: 'item_view_181'
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            //,css: 'transp'
                            ,elementsConfig:{
                                labelWidth: 110
                            }
                            ,elements:[
                                { view: 'radio', name: 'command', value: 181, options: [{id: 181, value: 'Once'},{id: 182, value: 'Cycle'}], label: 'Set relay'}

                                ,{ view: 'counter', name: 'param1', label: 'Relay #', min: 1, max: 10, tooltip: 'Relay number' }
                                ,{ view: 'radio', name: 'param2', label: 'Switch', options: [{id: 1, value: 'ON'}, {id: 0, value: 'OFF'}] }

                            ]
                        }
                    ]
                }

                // Cycle relay
                ,{
                    localId: 'item_view_182'
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            //,css: 'transp'
                            ,elementsConfig:{
                                labelWidth: 110
                            }
                            ,elements:[
                                { view: 'radio', label: 'Set relay', name: 'command', value: 182, options: [{id: 181, value: 'Once'},{id: 182, value: 'Cycle'}]}

                                ,{ view: 'counter', name: 'param1', label: 'Relay #', min: 1, max: 10, tooltip: 'Relay number' }
                                ,{ view: 'counter', name: 'param2', label: 'Cycle count', min: 1, max: 1000, tooltip: 'How many times relay being cycled' }
                                ,{ view: 'counter', name: 'param3', label: 'Cycle time, sec', min: 1, max: 1000, tooltip: 'Seconds between cycles' }

                            ]
                        }
                    ]
                }

                // Set servo
                ,{
                    localId: 'item_view_183'
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            //,css: 'transp'
                            ,elementsConfig:{
                                labelWidth: 110
                            }
                            ,elements:[
                                { view: 'radio', label: 'Set servo', name: 'command', value: 183, options: [{id: 183, value: 'Once'},{id: 184, value: 'Cycle'}]}

                                ,{ view: 'counter', name: 'param1', label: 'Servo #', min: 1, max: 20, tooltip: 'Servo number' }
                                ,{ view: 'counter', name: 'param2', label: 'PWM value', min: 900, max: 2100, step: 20, tooltip: 'PWM value typical 1000-2000' }

                            ]
                        }
                    ]
                }

                // Cycle servo
                ,{
                    localId: 'item_view_184'
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            //,css: 'transp'
                            ,elementsConfig:{
                                labelWidth: 110
                            }
                            ,elements:[
                                { view: 'radio', label: 'Set servo', name: 'command', value: 184, options: [{id: 183, value: 'Once'},{id: 184, value: 'Cycle'}]}

                                ,{ view: 'counter', name: 'param1', label: 'Servo #', min: 1, max: 20, tooltip: 'Servo number' }
                                ,{ view: 'counter', name: 'param2', label: 'PWM value', min: 900, max: 2100, step: 20, tooltip: 'Target PWM value typical 1000-2000' }
                                ,{ view: 'counter', name: 'param3', label: 'Cycle count', min: 1, max: 1000, tooltip: 'How many times servo being cycled' }
                                ,{ view: 'counter', name: 'param4', label: 'Cycle time, sec', min: 1, max: 1000, tooltip: 'Seconds between cycles' }

                            ]
                        }
                    ]
                }


                // Custom command
                ,{
                    localId: 'item_view_custom'
                    //,height: 200
                    ,rows: [
                        {
                            view:"form"
                            ,borderless: true
                            //,css: 'transp'
                            ,elementsConfig:{
                                labelWidth: 110
                            }
                            ,elements:[
                                { view: 'text', name: 'command', label: 'Command' }
                                ,{ view: 'text', name: 'frame', label: 'Frame' }
                                ,{ view: 'text', name: 'param1', label: 'Param 1' }
                                ,{ view: 'text', name: 'param2', label: 'Param 2' }
                                ,{ view: 'text', name: 'param3', label: 'Param 3' }
                                ,{ view: 'text', name: 'param4', label: 'Param 4' }
                                ,{ view: 'text', name: 'param5', label: 'Param 5' }
                                ,{ view: 'text', name: 'param6', label: 'Param 6' }
                                ,{ view: 'text', name: 'param7', label: 'Param 7' }
                            ]
                        }
                    ]
                }

            ]
        }

        // Панель с кнопками добавления и удаления
        ,{
            //view: 'toolbar'
            //,css: 'bg_panel'
            localId: 'item_toolbar'
            ,borderless: true
            ,height: 40
            ,cols: [
                //{ view: 'icon', icon: 'table-row-plus-before', localId: 'btn:add_before', tooltip: 'Add new item BEFORE this one'}
                { view: 'icon', icon: 'mdi mdi-table-row-plus-after', localId: 'btn:add_after', tooltip: 'Add new item AFTER this one'}
                ,{ gravity: 3 }
                ,{ view: 'icon', icon: 'mdi mdi-delete', localId: 'btn:remove_item', tooltip: 'Remove this item'}
            ]
        }


    ]
};


// Боковая панель редактирования задания
const edit_side_panel = {
    borderless: true
    ,rows: [

        mission_form

        // Таблица с элементами полетного плана
        ,{
            view: "datatable"
            ,localId: 'table:points'
            ,select: true
            ,borderless: true
            ,data: []//list_data
            ,columns:[
                { id:"title", header:"Action", template: function(row){
                        //
                        //  Шаблоны строк для представления элементов полетного плана
                        //

                        // Home
                        if( 'home' === row.id ){
                            return '<span class="webix_icon mdi mdi-home-map-marker"></span>Mission start';
                        }

                        // Go to point
                        else if( 16 === row.command ){
                            let str = '<span class="webix_icon mdi mdi-arrow-top-right-thick"></span>Go to point <b>' + row.marker_path_seq + '</b>, alt ' + row.param7 + ' m';
                            if( row.param1 && parseInt(row.param1) > 0 ){
                                str += ' and hold for ' + parseInt(row.param1) + ' seconds';
                            }
                            return str;
                        }

                        // Loiter unlimited
                        else if( 17 === row.command ){
                            return '<span class="webix_icon mdi mdi-arrow-top-right-thick"></span>Go to point <b>' + row.marker_path_seq + '</b>, alt ' + row.param7 + ' m and <span class="webix_icon mdi mdi-backup-restore"></span>loiter unlimited time';
                        }
                        // Loiter turns
                        else if( 18 === row.command ){
                            let str = '<span class="webix_icon mdi mdi-arrow-top-right-thick"></span>Go to point <b>' + row.marker_path_seq + '</b>, alt ' + row.param7 + ' m ';
                            if( row.param1 && parseInt(row.param1) > 0 ){
                                str += ' and <span class="webix_icon mdi mdi-backup-restore"></span>loiter ' + parseInt(row.param1) + ' turns';
                            }
                            return str;
                        }
                        // Loiter time
                        else if( 19 === row.command ){
                            let str = '<span class="webix_icon mdi mdi-arrow-top-right-thick"></span>Go to point <b>' + row.marker_path_seq + '</b>, alt ' + row.param7 + ' ';
                            if( row.param1 && parseInt(row.param1) > 0 ){
                                str += ' and <span class="webix_icon mdi mdi-backup-restore"></span>loiter for ' + parseInt(row.param1) + ' seconds';
                            }
                            return str;
                        }
                        // Loiter alt
                        else if( 31 === row.command ){
                            let str = '<span class="webix_icon mdi mdi-arrow-top-right-thick"></span>Go to point <b>' + row.marker_path_seq + '</b> ';
                            if( row.param7 && parseInt(row.param7) > 0 ){
                                str += ' and <span class="webix_icon mdi mdi-backup-restore"></span>loiter to ' + parseInt(row.param7) + ' m alt';
                            }
                            return str;
                        }

                        // Land
                        else if( 21 === row.command ){
                            return '<span class="webix_icon mdi mdi-airplane-landing"></span>Land at point <b>' + row.marker_path_seq + '</b>';
                        }

                        // Takeoff
                        else if( 22 === row.command ){
                            return '<span class="webix_icon mdi mdi-airplane-takeoff"></span>Takeoff at ' + row.param7 + ' m';
                        }

                        // Change speed
                        else if( 178 === row.command ){
                            let str = 'Change ';
                            if( row.param2 >= 0 ) str += (parseInt(row.param1) === 1 ? 'ground speed' : 'airspeed') + ' to ' + row.param2 + ' m/s ';
                            if( row.param3 >= 0 ) str += (row.param2 >= 0 ? 'and ' : '') + 'throttle to ' + parseInt(row.param3) + '%';

                            if( 'Change ' === str ) str+= 'nothing in speed and throttle';

                            return '<span class="webix_icon mdi mdi-speedometer"></span>' + str;
                        }

                        // Set relay
                        else if( 181 === row.command ){
                            let sw = 'OFF';
                            let icon = 'toggle-switch-off-outline';
                            if( row.param2 > 0 ){
                                sw = 'ON';
                                icon = 'toggle-switch';
                            }

                            return '<span class="webix_icon mdi mdi-'+icon+'"></span>Relay #<i>'+row.param1+'</i> switch '+sw; //
                        }

                        // Cycle relay
                        else if( 182 === row.command ){
                            return '<span class="webix_icon mdi mdi-toggle-switch"></span><span class="webix_icon mdi mdi-repeat"></span>' +
                                'Relay #<i>' + row.param1 + '</i> cycle ' + row.param2 + (row.param2>1?' times':'time');
                        }

                        // Set servo
                        else if( 183 === row.command ){
                            let icon = '<span class="webix_icon mdi mdi-engine"></span>';
                            return icon + 'Servo #<i>'+row.param1+'</i> set PWM='+row.param2;
                        }

                        // Repeat servo
                        else if( 184 === row.command ){
                            let icon = '<span class="webix_icon mdi mdi-engine"></span><span class="webix_icon mdi mdi-repeat"></span>';
                            return icon + 'Servo #<i>'+row.param1+'</i> cycle '+row.param3+' '+(row.param3 === 1?'time':'times');
                        }


                        // Custom command
                        else {
                            return '<span class="webix_icon mdi mdi-alert-decagram"></span>CUSTOM COMMAND ' + row.command; // любая команда другая без обработчика
                        }

                    }, fillspace: true }
                /*
            ,{ id:"alt",	header:"Alt", width: 100, template: function(row){
                    return row.alt ? row.alt : '';
                }}
                */

                //{ id:"spd",	header:"Speed", width: 100}
            ]
            //,autowidth: true
            ,subview: item_subview

        }


    ]

};


// Все окно интерфейса
const view_config = {
    padding: 0
    ,borderless: true
    ,border: false
    ,cols: [
        {
            rows: [
                // карта
                {
                    view: "google-map",
                    localId: "mission:map",
                    zoom:13,
                    mapType: 'SATELLITE',
                    gravity: 3,
                    center:[ 55.751244, 37.618423 ]
                }

                // Нижняя панель с информацией о задании и графиком высоты
                ,{
                    height: 100
                    ,cols: [

                        // Вычисляемые данные о маршруте
                        {
                            width: 210
                            ,localId: 'tpl:route_data'
                            ,template: 'Route length'
                                + ': #dist# km<br/>'
                            //+ 'Время полета: X мин<br/>'
                            //+ 'Макс высота: 120 м'
                            ,data: {
                                dist: ''
                            }
                        }

                        // график высоты
                        ,{
                            view: "chart"
                            ,padding: 20
                            ,height: 100
                            ,localId: "chart:alt"
                            ,type:"line"
                            ,value: "#param7#"
                            ,tooltip:{
                                template: "Alt: #param7# m"
                            }
                            ,item:{
                                borderColor: "#1293f8",
                                color: "#ffffff"
                            }
                            ,line:{
                                color:"#1293f8",
                                width:3
                            }
                            ,xAxis:{
                                template: function(row){
                                    return row.marker_path_seq === 0 ? 'H' : row.marker_path_seq;
                                }
                                ,lines: false
                            }
                            ,offset:0
                            ,yAxis:{
                                start:0
                                //end:100,
                                ,step:10
                                ,lines: false
                                ,template:function(obj){
                                    return (obj%20?"":obj)
                                }
                            }
                            //,tooltip: 'Высота точек маршрута'
                        }

                    ]
                }

            ]
        }

        // боковая панель редактирования
        ,{
            width: 500
            ,gravity: 2
            ,borderless: true
            ,body: {
                borderless: true
                ,rows: [
                    edit_side_panel
                ]
            }
        }

    ]
};


// Всплывающее окно поиска адреса
const address_popup = {
    view:"window",
    //id:"new_map_popup",
    //height: 250,
    width: 300,
    top: 100,
    left: 100
    ,headHeight: 1
    //,padding: 5
    ,body:{
        borderless: true
        ,padding: 20
        ,rows: [
            {
                template: 'Enter address or coordinates<br/>to search:'
                ,height: 70
                ,borderless: true
            }
            ,{
                view: 'text'
                ,localId: 'text:search_loc'
                ,labelWidth: 10
                ,placeholder: 'city, address or geo coordinates'
            }
            ,{
                cols: [
                    {
                        view: 'button'
                        ,localId: 'button:search_loc'
                        ,label: 'Search'
                        //,width: 80
                        ,css: 'button_primary button_raised'
                    }
                    ,{width: 20}
                    ,{
                        view: 'button'
                        ,label: 'Close'
                        //,width: 80
                        ,css: 'button_primary'
                        ,click: function(){
                            this.getTopParentView().hide();
                        }
                    }
                ]
            }
        ]
    }
};


// Всплывающее меню с элементами полетного плана
const item_add_popup = {
    view: 'popup'
    //,width: 300
    ,height: 200
    //,headHeight: 1
    ,padding: 5
    ,body: {
        view: 'menu'
        ,layout: 'y'
        ,data: [
            // id = MAV_CMD по умолчанию в группе
            { id: 22, value: 'Takeoff', icon: 'mdi mdi-airplane-takeoff'}
            //,{ id: 21, value: 'Land'}
            ,{ id: 178, value: 'Change speed', icon: 'mdi mdi-speedometer'}
            //,{ id: 186, value: 'Change altitude'}
            ,{ id: 19, value: 'Loiter', icon: 'mdi mdi-backup-restore' }
            //,{ id: 200, value: 'Camera control'}
            ,{ id: 181, value: 'Relay switch', icon: 'mdi mdi-toggle-switch' }
            ,{ id: 183, value: 'Servo control', icon: 'mdi mdi-engine' }
        ]
    }
};


// Конфигурация вида карты
const map_config = {
    fullscreenControl: false
    ,panControl: false
    ,rotateControl: false
    ,streetViewControl: false
    ,scaleControl: false
    ,zoomControlOptions: {
        position: google.maps.ControlPosition.LEFT_TOP
    }
};




export default class FlightPlanEditView extends JetView{

    config(){
        return view_config;
    }

    init(view, url){

        this.top_controls_id = null;
        this.address_popup = this.ui(address_popup);
        this.drone_choose = this.ui(DroneChoose);
        this.item_add_popup = this.ui(item_add_popup);

        this.top_controls_id = webix.$$('top_view_controls').addView(top_controls);

        this.$$('mission:map').getMap().setOptions(map_config);

        webix.extend(view, webix.ProgressBar);

    }

    ready(view, url){

        const fp_id = this.getParam("id");

        if( !fp_id || !FlightPlansCollection.getItem(fp_id) || !FlightPlansCollection.FP[fp_id] ){
            this.app.show('/app/flight_plans_list');
            return;
        }

        FlightPlansCollection.FP[fp_id].openEditor(view);

    }

    urlChange(view, url) {}

    destroy(){

        if( webix.$$('top_view_controls') && this.top_controls_id ){
            webix.$$('top_view_controls').removeView(this.top_controls_id);
            this.top_controls_id = null;
        }

        // Для всех полетных планов отключить вид
        FlightPlansCollection.data.each(function(plan){
            FlightPlansCollection.FP[plan.id].destroy_view();
        });

    }

}


