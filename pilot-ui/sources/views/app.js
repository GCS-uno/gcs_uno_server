import {JetView} from "webix-jet";

import top_toolbar	from "views/toolbars/top_toolbar";
import sidebar from "views/menus/sidebar";
import DronesCollection from "../models/DronesCollection";


export default class AppView extends JetView {
	config(){
		return {
            borderless: true
            ,padding: 0
            //,css: "webix_dark"
            ,rows:[
                top_toolbar
                ,{
                    cols: [
                        sidebar
                        ,{ $subview: true }
                    ]
                }
            ]
        };
	}

	//init(view, url){}
	ready(view, url){

        // Здесь загружаем коллекции, которые нельзя обновлять при открытии вкладок
        DronesCollection.List();

    }
}


