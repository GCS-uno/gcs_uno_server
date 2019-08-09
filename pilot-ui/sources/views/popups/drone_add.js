import {JetView} from "webix-jet";

import controllers from './../../controllers/drone_add';

import validators from './../../../../defs/form_validators';

export default class DroneAddWindow extends JetView {

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
        this.getRoot().show();
    }

}


const popup_config = {
    view: "window"
    ,type: 'material'
    ,localId: 'window:add_new'
    ,modal: true
    ,head: "Add new drone"
    ,position:"center"
    ,body:{
        padding: 30
        ,width: 500
        ,borderless: true
        ,rows: [
            {
                view: 'form'
                ,localId: 'form:add'
                ,borderless: true
                ,elementsConfig: {
                    labelWidth: 100
                }
                ,elements: [
                    {
                        view: 'text'
                        ,label: 'Drone name'
                        ,name: 'name'
                        ,required: true
                        ,placeholder: 'My new drone'
                        ,validate: validators.drone.name.func
                        ,invalidMessage: validators.drone.name.shortMessage
                        ,bottomPadding: 18 // for validation message
                    }
                    ,{
                        view: 'richselect'
                        ,name: "type"
                        ,label: "Type"
                        ,value: "dji"
                        ,options: [
                            { id: "dji", value: "DJI" }
                            ,{ id: "mavlink", value: "MAVLink" }
                        ]
                    }
                ]
                ,rules: {
                    name: function(value){
                        return /^([a-zA-Z0-9\s]{2,50})$/.test(value.trim());
                    }
                }
            }
            ,{ height: 30 }
            ,{
                borderless: true
                ,cols: [
                    {
                        view: 'button'
                        ,localId: 'button:save'
                        ,type: 'iconButton'
                        ,icon: 'mdi mdi-content-save'
                        ,label: 'Create'
                        ,css: 'button_primary button_raised'
                        ,tooltip: 'Create new drone'
                        ,autowidth: true
                        ,align: 'center'
                    }
                    ,{}
                    ,{
                        view: 'button'
                        ,localId: 'button:cancel'
                        ,type: 'iconButton'
                        ,icon: 'mdi mdi-cancel'
                        ,label: 'Cancel'
                        ,css: 'webixtype_danger'
                        ,tooltip: 'Cancel creating new drone'
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
