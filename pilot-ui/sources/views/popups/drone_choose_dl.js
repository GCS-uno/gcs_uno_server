import {JetView} from "webix-jet";

import controllers from './../../controllers/drone_choose_dl';


export default class DroneChooseWindow extends JetView {

    config(){
        return popup_config;
    }

    init(view, url){

    }

    ready(view, url){
        controllers.ready(view);
    }

    destroy(){

    }

    showWindow(){
        return controllers.showWindow(this);
    }

}


const popup_config = {
    view: "window"
    ,type: 'material'
    ,localId: 'window:choose_drone'
    ,modal: true
    ,head: "Download flight plan from drone"
    ,position:"center"
    ,body:{
        padding: 30
        ,width: 500
        ,borderless: true
        ,rows: [
            {
                view: 'form'
                ,localId: 'form:drone_choose'
                ,borderless: true
                ,elementsConfig: {
                    labelWidth: 160
                }
                ,elements: [
                    {
                        view: 'richselect'
                        ,label: 'Drones online'
                        ,name: 'drone_select'
                    }

                ]
            }
            ,{ height: 30 }
            ,{
                borderless: true
                ,cols: [
                    {
                        view: 'button'
                        ,localId: 'btn:download'
                        ,type: 'iconButton'
                        ,icon: 'download'
                        ,label: 'Download'
                        ,css: 'button_primary button_raised'
                        ,tooltip: 'Choose drone'
                        ,autowidth: true
                        ,align: 'center'
                    }
                    ,{}
                    ,{
                        view: 'button'
                        ,localId: 'btn:cancel'
                        ,type: 'iconButton'
                        ,icon: 'cancel'
                        ,label: 'Cancel'
                        ,css: 'button_primary'
                        ,tooltip: 'Cancel creating'
                        ,click: function(){
                            this.getTopParentView().hide();
                        }
                        ,autowidth: true
                        ,align: 'center'
                    }
                ]
            }
        ]
    }
};
