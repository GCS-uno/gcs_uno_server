import {JetView} from "webix-jet";
import helpers from '../../../utils/helpers';
import LogsCollection from "../models/LogsCollection";
import Message from "../plugins/Message";


let top_controls_id = null;


export default class LogView extends JetView {

    config(){
        return view_config;
    }

    init(view, url){

        top_controls_id = webix.$$('top_view_controls').addView(view_controls);

    }

    ready(view, url){

        // drone_id передается в параметре открытия вида
        const log_id = this.getParam("id");

        // Если параметра нет или он не найден в коллекции
        // Открыть список
        if( !log_id || !LogsCollection.getItem(log_id) ){
            this.app.show('/app/logs_list');
            return;
        }

        const log_item = LogsCollection.getItem(log_id);

        // Сделать в заголовке ссылку на список и добавить название дрона
        this.app.getService('topTitle').update([{text: 'Logs', link: '/app/logs_list'}, {text: log_item.name}]);

        const map = this.$$('map:drone');

        // Создание вида после загрузки карты
        map.getMap(true).then(function(mapObj) {
            // Установка параметров карты
            mapObj.setOptions(map_options);
        });

        LogsCollection.Get(log_id)
            .then( data => {
                console.log('Log data', data);

                const alt_chart = this.$$('chart1');

                alt_chart.parse(data.alt_chart);

            })
            .catch( Message.error );

    }

    destroy(){
        if( webix.$$('top_view_controls') && top_controls_id ){
            webix.$$('top_view_controls').removeView(top_controls_id);
            top_controls_id = null;
        }
    }

}


//
// Кнопки для верхней панели
const view_controls = {
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
    view:"google-map",
    localId: "map:drone",
    zoom: 10,
    mapType: 'SATELLITE',
    center:[ 55, 37 ]
    ,height: 400
};

// Основной вид
const view_config = {
    padding: 0
    ,borderless: true
    ,border: false
    ,localId: 'body'
    ,view: 'scrollview'
    ,scroll: 'y'
    ,body: {
        rows: [
            {
                template: 'Some info about log'
                ,height: 100
            }

            ,{ height: 30 }

            ,map_config

            ,{ height: 30 }

            // Chart 1
            ,{
                view: 'chart',
                type: 'line',
                localId: 'chart1',
                height: 300,
                xValue: '#time#',
                origin: 0,
                yAxis:{
                    title: 'Altitude, m',
                    lines: true
                },
                xAxis:{
                    title: "Time, sec",
                    lines: false,
                    template: function(v){
                        let freq = 5;
                        let tf = v.time/freq;
                        if( tf % 5 === 0 ){
                            return tf.toString();
                        }
                        else return false;
                    }
                },

                eventRadius: 10,
                series:[
                    {   // setting for a line chart
                        value: "#alt#",
                        item:{radius:0},
                        line:{
                            color:"#de619c",
                            width: 2
                        },
                        tooltip:{
                            template:"#alt#" // tooltip
                        }
                    }
                    ,{   // setting for a line chart
                        value: "#alt2#",
                        item:{radius:0},
                        line:{
                            color:"#2f37de",
                            width: 2
                        }
                    },
                    {   // setting for a line chart
                        value: "#alt3#",
                        item:{radius:0},
                        line:{
                            color:"#de9005",
                            width:2
                        }
                    }
                ]
            }
        ]
    }
};
