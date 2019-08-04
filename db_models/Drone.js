const common_config = require('../configs/common_config')
     ,thinky = require('./../utils/thinky.js')
     ,validators = require('./../defs/form_validators'); // Form fields validators

const type = thinky.type
     ,r = thinky.r
     ,TABLE_NAME = "Drones";


const Drone = thinky.createModel(TABLE_NAME, {
         id: type.string()
        ,type: type.string().enum(["dji","mavlink"]).default("mavlink")
        ,name: type.string().min(2).max(50).required().validator(validators.drone.name)

        ,udp_port: type.number().default(common_config.DRONE_UDP_PORT_MIN).validator(validators.drone.udp_port)
        ,gcs_tcp_port: type.number().default(common_config.GCS_TCP_PORT_MIN).validator(validators.drone.gcs_tcp_port)

        ,mav_sys_id: type.number().default(1).min(1).max(255)
        ,mav_cmp_id: type.number().default(1).min(1).max(255)
        ,mav_gcs_sys_id: type.number().default(255).min(1).max(255)
        ,mav_gcs_cmp_id: type.number().default(0).min(0).max(255)

        ,dji_model: type.string()
        ,dji_fc_serial: type.string()

        ,joystick_enable: type.number().min(0).max(1).default(0)
        ,dl_log_on_disarm: type.number().min(0).max(1).default(0)

        ,video_stream_1: type.string()
        ,video_stream_2: type.string()
        ,video_stream_3: type.string()

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

    return this;
});


module.exports = Drone;


Drone.ensureIndex("createdAt");
Drone.ensureIndex("dji_model");
Drone.ensureIndex("dji_fc_serial");
