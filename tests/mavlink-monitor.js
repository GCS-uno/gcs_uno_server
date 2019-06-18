const {redisClientBuf} = require('../utils/redis')
    ,RK = require('../defs/redis_keys')
    ,MAVLink = require('./../utils/mavlink2/mavlink2')
    ,_ = require('lodash');


// Ardupilot
const hide_drone_messages = [ 0,1,2,4,24,27,29,32,30,33,34,35,36,42,62,65,74,87,100,109,111,116,125,129,136,147,150,152,163,164,165,173,178,182,193,241];
// PX1
// [0, 1, 2, 4, 22, 24, 27, 29, 30, 31, 32, 33, 34, 36, 42, 49, 62, 65, 74, 83, 85, 105, 87, 111, 116, 125, 129, 136, 137, 141, 147, 150, 152, 163, 164, 165, 178, 181, 182, 193, 230, 241, 242, 245, 3774, 3937, 3941, 3944, 3946, 3949, 3951, 3952, 3953, 3955, 3956, 3957, 3959, 3960, 3961, 3963, 3964, 3966, 3967, 3968, 3970, 3971, 3972, 3974, 3977, 3978, 3979, 65535];

// PX4
//const hide_drone_messages = [0, 1, 4, 24, 30, 31, 32, 33, 36, 42, 74, 83, 85, 87, 105, 106, 109, 141, 241, 230, 242, 245, 253, 3774];

// PX4 real
//const hide_drone_messages = [0, 1, 4, 24, 30, 32, 36, 65, 70, 74, 83, 85, 87, 105, 106, 109, 141, 230, 231, 241, 245];



const hide_gcs_messages = [0, 4]; // 69 - MANUAL_CONTROL


const MAVLINK_FROM_DRONE_MONITOR = RK.MAVLINK_FROM_DRONE_MONITOR()
     ,MAVLINK_TO_DRONE_MONITOR = RK.MAVLINK_TO_DRONE_MONITOR();

const redisSub = redisClientBuf.duplicate();
redisSub.subscribe(MAVLINK_FROM_DRONE_MONITOR);
redisSub.subscribe(MAVLINK_TO_DRONE_MONITOR);

const mavlink_to = new MAVLink();
const mavlink_from = new MAVLink();

mavlink_to.on('message', function(msg){
    if( !_.includes(hide_gcs_messages, msg.msgID))
        console.log(`to D < (v${msg.v}) ${msg.msgID} ${msg.name}: ${JSON.stringify(msg.fields)}`);
});

mavlink_from.on('message', function(msg){
    if( !_.includes(hide_drone_messages, msg.msgID) && msg.msgID < 3900)
        console.log(`from D > (v${msg.v}) ${msg.msgID} ${msg.name}: ${JSON.stringify(msg.fields)}`);
});

mavlink_to.errorHandler = function(err, err_msg){
    if( err === 'brokenPacket' ){
        console.log('Broken packet', err_msg);
    }
};
mavlink_from.errorHandler = function(err, err_msg){
    if( err === 'brokenPacket' ){
        console.log('Broken packet', err_msg);
    }
};

redisSub.on('message', function(channel, message){

    if( message.length > 1000 ) return console.log('Message > 1000 bytes');

    if( MAVLINK_FROM_DRONE_MONITOR === channel.toString() )
        mavlink_from.parse(message);

    else if( MAVLINK_TO_DRONE_MONITOR === channel.toString() )
        mavlink_to.parse(message);

});
