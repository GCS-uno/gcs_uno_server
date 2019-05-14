const common_config = require('../configs/common_config')
     ,thinky = require('./../utils/thinky.js')
     ,validators = require('./../defs/form_validators'); // Form fields validators

const type = thinky.type
     ,r = thinky.r
     ,TABLE_NAME = "Drones";


const Drone = thinky.createModel(TABLE_NAME, {
        id: type.string()
        ,name: type.string().min(2).max(50).required().validator(validators.drone.name)
        ,rtsp_video_url: type.string().default('')
        ,udp_port: type.number().validator(validators.drone.udp_port)
        ,gcs_tcp_port: type.number().default(common_config.GCS_TCP_PORT_MIN).validator(validators.drone.gcs_tcp_port)

        ,mav_sys_id: type.number().default(1).min(1).max(255)
        ,mav_cmp_id: type.number().default(1).min(1).max(255)
        ,mav_gcs_sys_id: type.number().default(255).min(1).max(255)
        ,mav_gcs_cmp_id: type.number().default(0).min(0).max(255)

        ,joystick_enable: type.number().min(0).max(1).default(0)
        ,joystick_x_channel: type.number().min(0).max(20).default(0)
        ,joystick_x_rev: type.number().min(0).max(1).default(0)
        ,joystick_y_channel: type.number().min(0).max(20).default(0)
        ,joystick_y_rev: type.number().min(0).max(1).default(0)

        ,createdAt: type.date().default(r.now())
    }
    , {
        //enforce_missing: false
        //,enforce_extra: 'remove'
        //,enforce_type: 'strict'
    }
);


Drone.defineStatic("getList", function() {

    return r.table(TABLE_NAME).without('createdAt');

});

Drone.defineStatic("look", function() {

    return r.table(TABLE_NAME).changes().run();

});


Drone.define("getView", function() {
    delete this.createdAt;

    // Для выставления пустого значения в селекте 0 глючит, поэтому для пустого значения ставим пока 100
    if( this.joystick_x_channel === 0 ) this.joystick_x_channel = 100;
    if( this.joystick_y_channel === 0 ) this.joystick_y_channel = 100;

    return this;
});


module.exports = Drone;


Drone.ensureIndex("createdAt");
