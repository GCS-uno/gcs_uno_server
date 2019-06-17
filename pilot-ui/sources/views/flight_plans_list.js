import {JetView} from "webix-jet";
import dateformat from '../../../utils/dateformat';
import DroneChoose from "./popups/drone_choose_dl";
import FlightPlansCollection from "../models/FlightPlansCollection";
import Message from "../plugins/Message";


//
// Кнопки для верхней панели приложения
const top_controls = {
    cols: [
        // Кнопка Добавить новый полетный план
        {
            view: 'button'
            ,type: 'iconButton'
            ,id: 'FPT:btn:add'
            ,label: 'New flight plan'
            ,icon: 'mdi mdi-plus'
            ,css: 'button_primary'
            ,autowidth: true
        }

        ,{width: 30}

        // Кнопка Загрузить план с борта
        /*
        ,{
            view: 'button'
            ,type: 'iconButton'
            ,id: 'FPT:btn:download'
            ,label: 'Download from drone'
            ,icon: 'mdi mdi-plus'
            ,css: 'button_primary'
            ,autowidth: true
        }
         */

        ,{}
    ]
};

//
// Основная таблица со списком
const view_config = {
    type: 'clean'
    ,rows: [

        // Таблица
        {
            view:"datatable"
            ,localId: 'tbl:flight_plans'
            ,select: true
            ,columns:[
                { id: "name",	header: "Name", sort: 'string', width: 200},
                { id: "location",	header: "Location", sort: 'string', fillspace: true},
                //{ id: "uav",	header:"БПЛА", 	width:100},
                //{ id: "dist",	header:"Длина" , width:100},
                //{ id: "time",	header:"Время", 	width:100},
                { id: "date",	header:"Date created" , width:200, sort: 'date',  template: function(row){
                        return dateformat(row.createdAt, 'HH:MM dd.mm.yyyy');
                    }}
                //{ id: "status",	header:"Status" , width:100},
            ]
        }
    ]

};



export default class FlightPlansView extends JetView {

    config(){
        return view_config;
    }

    init(view, url){

        this.top_controls_id = null;

        // Окно выбора дрона для загрузки задания
        this.drone_choose = this.ui(DroneChoose);

        const plans_table = this.$$('tbl:flight_plans');

        // Кнопки управления на верхней панели
        this.top_controls_id = webix.$$('top_view_controls').addView(top_controls);

        // Загрузка списка заданий
        FlightPlansCollection.List();

        // Подвязка таблицы с заданиями к коллекции заданий
        plans_table.data.sync(FlightPlansCollection);

    }

    ready(view, url){

        const button_new = webix.$$('FPT:btn:add');
        //const button_download = webix.$$('FPT:btn:download');
        const fp_table = this.$$('tbl:flight_plans');
        const _this = this;

        this.app.getService('topTitle').update('Flight plans');

        // Кнопка Новое задание
        button_new.attachEvent('onItemClick', function(){

            button_new.disable();

            FlightPlansCollection.Create()
                .then(function(id){
                    button_new.enable();
                    _this.show('flight_plan_edit?id=' + id);
                })
                .catch(function(msg){
                    button_new.enable();
                    Message.error(msg);
                });

        });

        // Кнопка загрузить задание с дрона
        /*
        button_download.attachEvent('onItemClick', function(){
            _this.drone_choose.showWindow().then(function(drone){

                // drone = Drone
                // drone.downloadFP()
                // TODO
                webix.message('1111');

            }).catch(function(err){
                Message.error(err);
            });
        });

         */

        // Клик на строку в таблице открывает задание
        fp_table.attachEvent('onItemClick', function(id){
            _this.show('flight_plan_edit?id=' + id);
        });

    }

    urlChange(view, url){}

    destroy(){
        if( webix.$$('top_view_controls') && this.top_controls_id ){
            webix.$$('top_view_controls').removeView(this.top_controls_id);
            this.top_controls_id = null;
        }
    }

}


