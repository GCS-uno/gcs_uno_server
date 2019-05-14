import {JetView} from "webix-jet";

import controllers from './../../controllers/drone_edit';
import validators from "../../../../defs/form_validators";


export default class DroneEditWindow extends JetView {

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

    showWindow(drone_id){
        controllers.open(this, drone_id);
    }

}


const rc_channel_options = [
     { id: 100, value: 'Disable' }
    ,{ id: 1, value: 'RC chan 1' }
    ,{ id: 2, value: 'RC chan 2' }
    ,{ id: 3, value: 'RC chan 3' }
    ,{ id: 4, value: 'RC chan 4' }
    ,{ id: 5, value: 'RC chan 5' }
    ,{ id: 6, value: 'RC chan 6' }
    ,{ id: 7, value: 'RC chan 7' }
    ,{ id: 8, value: 'RC chan 8' }
    ,{ id: 9, value: 'RC chan 9' }
    ,{ id: 10, value: 'RC chan 10' }
    ,{ id: 11, value: 'RC chan 11' }
    ,{ id: 12, value: 'RC chan 12' }
    ,{ id: 13, value: 'RC chan 13' }
    ,{ id: 14, value: 'RC chan 14' }
    ,{ id: 15, value: 'RC chan 15' }
    ,{ id: 16, value: 'RC chan 16' }
    ,{ id: 17, value: 'RC chan 17' }
    ,{ id: 18, value: 'RC chan 18' }
];


// Форма редактирования дрона
const popup_config = {
    view: "window"
    ,type: 'material'
    ,localId: 'window:edit'
    ,modal: true
    ,head: "Edit drone"
    ,position:"center"
    ,body:{
        padding: 30
        ,width: 500
        ,height: 500
        ,borderless: true
        ,rows: [

            {
                view: 'scrollview'
                ,localId: 'scrollForm'
                ,scroll: 'y'
                ,body: {
                    rows: [
                        {
                            view: 'form'
                            ,localId: 'form:edit'
                            ,borderless: true
                            ,elementsConfig: {
                                labelWidth: 120
                            }
                            ,elements: [

                                // name
                                {
                                    view: 'text'
                                    ,label: 'Drone name'
                                    ,name: 'name'
                                    ,placeholder: 'My drone'
                                    ,validate: validators.drone.name.func
                                    ,invalidMessage: validators.drone.name.shortMessage
                                    ,bottomPadding: 18 // for validation message
                                }

                                // udp port
                                ,{
                                    view: 'text'
                                    ,label: 'UDP port IN'
                                    ,name: 'udp_port'
                                    ,placeholder: '35000'
                                    ,validate: validators.drone.udp_port.func
                                    ,invalidMessage: validators.drone.udp_port.shortMessage
                                }

                                // GCS TCP port
                                ,{
                                    view: 'text'
                                    ,label: 'TCP port OUT'
                                    ,name: 'gcs_tcp_port'
                                    ,placeholder: '55000'
                                    ,validate: validators.drone.gcs_tcp_port.func
                                    ,invalidMessage: validators.drone.gcs_tcp_port.shortMessage
                                }

                                // rtsp url
                                ,{
                                    view: 'text'
                                    ,label: 'Video stream'
                                    ,name: 'rtsp_video_url'
                                    ,placeholder: 'video_test'
                                    ,type: 'url'
                                }

                                //*
                                // joystick
                                ,{
                                    rows: [
                                        //{ template: 'Joystick', type:"section" }
                                        { view: 'checkbox', name: 'joystick_enable', labelRight: 'Enable joystick', value: 0, labelWidth: 0, on: {
                                                'onChange': function(n, o){
                                                    /*
                                                    if( n ){
                                                        this.getFormView().queryView({localId: 'joystick_channels'}).show();
                                                    }
                                                    else {
                                                        this.getFormView().queryView({localId: 'joystick_channels'}).hide();
                                                    }
                                                    */
                                                }
                                            }
                                        }
                                        /*
                                        ,{
                                            localId: 'joystick_channels'
                                            ,hidden: true
                                            ,rows: [
                                                {
                                                    cols: [
                                                        { view: 'richselect', name: 'joystick_x_channel', label: 'X (right-left)', options: rc_channel_options, width: 250 }
                                                        ,{ width: 20 }
                                                        ,{ view: 'checkbox', name: 'joystick_x_rev', label: 'reversed', value: 0, labelWidth: 70, width: 130 }
                                                    ]
                                                }
                                                ,{
                                                    cols: [
                                                        { view: 'richselect', name: 'joystick_y_channel', label: 'Y (up-down)', options: rc_channel_options, width: 250 }
                                                        ,{ width: 20 }
                                                        ,{ view: 'checkbox', name: 'joystick_y_rev', label: 'reversed', value: 0, labelWidth: 70, width: 130 }
                                                    ]
                                                }
                                            ]
                                        }
                                        */
                                    ]
                                }
                                //*/

                                //*
                                // mavlink
                                ,{
                                    rows: [
                                        { template: 'MAVLink', type:"section" }
                                        ,{
                                            cols: [

                                                {
                                                    view: 'text'
                                                    ,label: 'Board sys ID'
                                                    ,name: 'mav_sys_id'
                                                    ,tooltip: 'MAVlink system ID, as defined in your autopilot'
                                                    ,placeholder: '1'
                                                    ,validate: webix.rules.isNumber
                                                }
                                                ,{width: 20}
                                                ,{
                                                    view: 'text'
                                                    ,label: 'Board comp ID'
                                                    ,name: 'mav_cmp_id'
                                                    ,tooltip: 'MAVlink component ID, as defined in your autopilot'
                                                    ,placeholder: '1'
                                                    ,validate: webix.rules.isNumber
                                                }

                                            ]
                                        }
                                        ,{
                                            cols: [

                                                {
                                                    view: 'text'
                                                    ,label: 'GCS sys ID'
                                                    ,name: 'mav_gcs_sys_id'
                                                    ,tooltip: 'MAVlink system ID for GCS, as defined in your autopilot'
                                                    ,placeholder: '255'
                                                    ,validate: webix.rules.isNumber
                                                }
                                                ,{width: 20}
                                                ,{
                                                    view: 'text'
                                                    ,label: 'GCS comp ID'
                                                    ,name: 'mav_gcs_cmp_id'
                                                    ,tooltip: 'MAVlink component ID for GCS, as defined in your autopilot'
                                                    ,placeholder: '0'
                                                    ,validate: webix.rules.isNumber
                                                }

                                            ]
                                        }
                                    ]
                                }
                                //*/

                                ,{ height: 30 }

                                // Button Remove
                                ,{
                                    view: 'button'
                                    ,label: 'Remove this drone'
                                    //,width: 200
                                    ,localId: 'button:remove'
                                    ,css: 'button_danger'
                                }
                            ]
                        }
                    ]
                }
            }


            ,{height: 30}

            //
            // Кнопки СОХРАНИТЬ и ОТМЕНИТЬ
            ,{
                borderless: true
                ,cols: [
                    {
                        view: 'button'
                        ,localId: 'button:save'
                        ,type: 'iconButton'
                        ,icon: 'mdi mdi-content-save'
                        ,label: 'Save'
                        ,css: 'button_primary button_raised'
                        ,tooltip: 'Save'
                        ,autowidth: true
                    }
                    ,{}
                    ,{
                        view: 'button'
                        ,localId: 'button:cancel'
                        ,type: 'iconButton'
                        ,icon: 'mdi mdi-cancel'
                        ,label: 'Cancel'
                        ,css: 'button_primary'
                        ,tooltip: 'Cancel saving'
                        ,click: function(){
                            this.getTopParentView().hide();
                        }
                        ,autowidth: true
                    }
                ]
            }
        ]
    }
};
