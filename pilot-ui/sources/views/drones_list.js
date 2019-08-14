import {JetView} from "webix-jet";

import DroneAddWindow from './popups/drone_add';
import DroneEditWindow from './popups/drone_edit';

import DronesCollection from '../models/DronesCollection';

let top_controls_id = null;


export default class DronesView extends JetView{
    config(){
        return view_config;
    }

    init(view, url){
        this.add_window = this.ui(DroneAddWindow);
        this.edit_window = this.ui(DroneEditWindow);
        this.drone_context_menu = this.ui(drone_context_menu);

        top_controls_id = webix.$$('top_view_controls').addView(top_controls);

        // Синхронизация с коллекцией
        this.$$('table:drones').sync(DronesCollection);

    }

    ready(view, url){

        const table_drones = this.$$('table:drones');
        const context_menu = this.drone_context_menu;
        const _this = this;

        //
        // Установить заголовок приложения
        this.app.getService('topTitle').update('Drones');

        //
        // Кнопка Добавить новый дрон
        webix.$$('dltv:btn:add').attachEvent('onItemClick', () => {
            // Открыть окно добавления нового дрона
            this.add_window.showWindow();
        });

        //
        // Клик по строке с дронами открывает меню
        table_drones.attachEvent('onItemClick', function(id, e, node){

            context_menu.show({x: e.x, y: e.y});
            context_menu.queryView({view:'form'}).setValues({drone_id: id.toString()});

        });

        //
        // Меню дронов
        context_menu.queryView({view:'menu'}).attachEvent('onItemClick', function(option){

            let drone_id = null;

            try {
                drone_id = context_menu.queryView({view:'form'}).getValues().drone_id
            }
            catch (e) { }

            if( drone_id ){
                let drone_item = DronesCollection.getItem(drone_id);

                if( drone_item ){
                    if( 'settings' === option ){
                        _this.edit_window.showWindow(drone_id);
                    }
                    else if( 'control' === option ){
                        if( drone_item.type === "dji" ) _this.show('dji_drone_control?id=' + drone_id);
                        else _this.show('mav_drone_control?id=' + drone_id);
                    }
                }

            }

            context_menu.hide();

        });

    }

    urlChange(view, url){}

    destroy(){
        if( webix.$$('top_view_controls') && top_controls_id ){
            webix.$$('top_view_controls').removeView(top_controls_id);
        }

        //controllers.destroy();
    }

}


//
// Кнопки для верхней панели приложения
const top_controls = {
    cols: [
        // Кнопка Добавить нового дрона
        {
            view: 'button'
            ,type: 'iconButton'
            ,id: 'dltv:btn:add'
            ,label: 'New drone'
            ,icon: 'mdi mdi-plus'
            ,css: 'button_primary'
            ,autowidth: true
        }
        ,{}
    ]
};


//
// Контекстное меню действий с дронами
const drone_context_menu = {
    view:"context"
    ,width: 180
    ,height: 80
    //,css: 'webix_dark'
    ,body: {
        rows: [
            {
                view: 'menu'
                ,layout: 'y'
                ,data: [
                     { id: 'control', icon: 'mdi mdi-gamepad', value: 'Control' }
                    //,{ id: 'link', icon: 'mdi mdi-link', value: 'GCS link' }
                    ,{ id: 'settings', icon: 'mdi mdi-settings', value: 'Settings' }
                ]
            }
            ,{view: 'form', height: 1, elements: [], borderless: true } // форма для хранения drone_id
        ]
        ,borderless: true
    }


};


//
// Основная таблица со списком
const view_config = {
    //type: 'clean'
    //css: 'webix_dark'
    rows: [

        // Таблица
        {
            view:"datatable"
            ,localId: 'table:drones'
            ,select: true
            //,css: 'webix_dark'
            ,columns:[
                { id: "name",	header:"Name", fillspace: true},
                { id: "type",	header:"Type" , width: 150, template: function(row){let value = row.type;if(value==="dji")return "DJI";else if(value==="mavlink")return "MAVLink";else return "Unknown"}},
                { id: "status",	header:"Status" , width: 150}
            ]

        }
    ]

};



