import {JetView} from "webix-jet";

import controllers from './../../controllers/drone_choose';


export default class DroneChooseWindow extends JetView {

    config(){
        return popup_config;
    }

    init(){

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
    ,head: "Upload flight plan to drone"
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
                        ,localId: 'btn:upload'
                        ,type: 'iconButton'
                        ,icon: 'mdi mdi-upload'
                        ,label: 'Upload'
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
                        ,icon: 'mdi mdi-cancel'
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
