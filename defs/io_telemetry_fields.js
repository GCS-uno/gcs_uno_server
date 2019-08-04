const mavlink_telem1_fields = [
     'armed'
    ,'alt'
    ,'bat_c' // Battery current
    ,'bat_rem' // Battery remaining %
    ,'bat_v' // Battery voltage
    ,'dist_home'
    ,'gps_speed'
    ,'lat'
    ,'lon'
    ,'mode'
    ,'rc'
    ,'sats'
    ,'sys_load'  // TODO реализовать в интерфейсе MAVLink: SYS_STATUS.load
    ,'sys_status' // MAVLink: MAV_STATE(status) в текстовом виде из defs/mavlink.js
    ,'dest_point'
];

const mavlink_telem10_fields = [
     'r' //roll
    ,'p' //pitch
    ,'y' //yaw
];


module.exports = {telem1_fields: mavlink_telem1_fields, telem10_fields: mavlink_telem10_fields};
