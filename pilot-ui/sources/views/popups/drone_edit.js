import {JetView} from "webix-jet";

import controllers from './../../controllers/drone_edit';
import validators from "../../../../defs/form_validators";


export default class DroneEditWindow extends JetView {

    config(){
        return popup_config;
    }

    init(){}

    ready(view, url){
        controllers.ready(view);
    }

    destroy(){}

    showWindow(drone_id){
        controllers.open(this, drone_id);
    }

}


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

                                // DJI model
                                ,{
                                    view: 'text'
                                    ,label: 'DJI Model'
                                    ,name: 'dji_model'
                                    ,readonly: true
                                    ,disabled: true
                                }

                                // DJI SN
                                ,{
                                    view: 'text'
                                    ,label: 'FC Serial #'
                                    ,name: 'dji_fc_serial'
                                    ,readonly: true
                                    ,disabled: true
                                }


                                // Video streams
                                ,{ view: 'text' ,label: 'Video stream 1' ,name: 'video_stream_1' }
                                ,{ view: 'text' ,label: 'Video stream 2' ,name: 'video_stream_2' }
                                ,{ view: 'text' ,label: 'Video stream 3' ,name: 'video_stream_3' }

                                // joystick
                                ,{
                                    rows: [
                                        //{ template: 'Joystick', type:"section" }
                                        { view: 'checkbox', name: 'joystick_enable', labelRight: 'Enable joystick', value: 0, labelWidth: 0 }

                                    ]
                                }

                                // Download log on disarm dl_log_on_disarm
                                ,{
                                    localId: "dl_log_on_disarm_row"
                                    ,rows: [
                                        //{ template: 'Joystick', type:"section" }
                                        { view: 'checkbox', name: 'dl_log_on_disarm', labelRight: 'Download latest log on disarm', value: 0, labelWidth: 0 }
                                    ]
                                }

                                //*
                                // mavlink
                                ,{
                                    localId: "mavlink_section"
                                    ,rows: [
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
