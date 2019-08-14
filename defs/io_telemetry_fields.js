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
     'roll'
    ,'pitch'
    ,'yaw'
];

const dji_telem1_fields = [
    'protV',
    'stateUpdateTS',
    'armed',
    'isFlying',
    'flightTime',
    'mode',
    'alt',
    'lon',
    'lat',
    'h_speed',
    'v_speed',
    'sats',
    'gps_qual',
    'ultra_sonic_alt',
    'bat_voltage',
    'bat_current',
    'bat_remains_percent',
    'bat_temp',
    'mode_name'
];

const dji_telem10_fields = [
     'protV'
    ,'roll'
    ,'pitch'
    ,'yaw'
];


module.exports = {
    telem1_fields: mavlink_telem1_fields,
    telem10_fields: mavlink_telem10_fields,
    dji_telem1_fields: dji_telem1_fields,
    dji_telem10_fields: dji_telem10_fields
};
