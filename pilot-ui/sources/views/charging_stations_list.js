import {JetView} from "webix-jet";

import Message from "../plugins/Message";

let top_controls_id = null;

export default class ChargingStationsListView extends JetView {
    config(){
        return view_config;
    }

    init(view, url){

        top_controls_id = webix.$$('top_view_controls').addView(top_controls);

    }

    ready(view, url){

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


//
// Основная таблица со списком
const view_config = {
    type: 'clean'
    ,rows: [

        {
            template: 'Under development'
        }
    ]

};

