const telem1_fields = [
     'armed'
    ,'alt'
    ,'base_mode'
    ,'bat_c'
    ,'bat_rem'
    ,'bat_v'
    ,'custom_mode'
    ,'dist_home'
    //,'gps_cog'
    //,'gps_fix'
    ,'gps_speed'
    ,'lat'
    ,'lon'
    ,'m_stab'
    ,'m_guid'
    ,'m_auto'
    ,'mode'
    //,'pos_hdg'
    ,'rc'
    ,'sats'
    ,'sys_load'
    ,'sys_status'
    ,'dest_point'
];

const telem10_fields = [
     'r' //roll
    ,'p' //pitch
    ,'y' //yaw
];


module.exports = {telem1_fields, telem10_fields};
