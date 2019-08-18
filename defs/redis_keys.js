/*
Redis keys mapper
    Usage
        const RK = require('./defs/redis_keys')
        RK.DEF_KEY(id)

 */

const _ = require('lodash');

const keys_prefixes = {

    //
    //    Переменные
    //

    // Общие



    //
    // + DRONE_ID

    // Состояние UDP сервера по ID дрона для которого он работает. Обновляется каждую секунду, если есть входящие сообщения.
    UDP_STATUS_KEY: 'key_udp_status_drone_' // + DRONE_ID  статус UDP сервера для каждого дрона
        /*     {object} =
                status  // статус UDP сервера 1 или 0 = online или offline
                mrate   // средний поток сообщений в секунду (за последние 5 секунд)
                last    // timestamp в секундах когда было последнее сообщение
        */

     /*
        Данные о дроне
            Pub
                DroneServer
            Sub
                pilot-server
      */
    ,DRONE_INFO_KEY: 'key_info_drone_' // + DRONE_ID информация о дроне {hash}
        /*

                ft: тип дрона в текстовом виде из mav_json -> FRAME_TYPES
                at: тип автопилота в текстовом виде mav_json -> AUTOPILOTS
                ac: категория автопилота (plane, copter, rover, boat, vtol, other)

                online: (0,1)
                last_message_time: UNIX timestamp in seconds
                online_from: UNIX timestamp in seconds

                h_pos_lat
                h_pos_lon

                last_pos_lat
                last_pos_lon

                udp_ip_s: статус DroneUDPProxy для дрона (0,1)
                udp_ip_c: информация о подключеннии

                tcp_op_s: статус DroneUDPProxy для дрона (0,1)
                tcp_op_c: информация о подключеннии

                model: DJI model
                sn: DJI FC serial number

         */

    //
    //   *****        Каналы       ******
    //

    //
    // Общие

    /*
        Канал для мониторинга MAVLink
     */
    ,MAVLINK_FROM_DRONE_MONITOR: 'ch_monitor_mavlink_from_drone'
    ,MAVLINK_TO_DRONE_MONITOR: 'ch_monitor_mavlink_to_drone'

    /*
        Канал управления DroneUDPProxy
     */
    ,DRONE_UDP_PROXY_CONTROL: 'ch_drone_udp_proxy_control'

    /*
        Канал управления GCSTCPProxy
     */
    ,GCS_TCP_PROXY_CONTROL: 'ch_gcs_tcp_proxy_control'



    //
    // + DRONE_ID

    /*
        Канал с входящими mavlink сообщениями от дрона
            Pub:
                DroneUDPProxy, DroneIoProxy, DroneTCPProxy
            Sub
                DroneServer, GCSTCPProxy

        (message_buffer)
     */
    ,MAVLINK_FROM_DRONE: 'ch_mavlink_from_drone_' // + DRONE_ID

    /*
        Канал с исходящими mavlink сообщениями для дрона
            Pub
                DroneServer, GCSTCPProxy
            Sub
                DroneUDPProxy, DroneIoProxy, DroneTCPProxy

        (message_buffer)
     */
    ,MAVLINK_TO_DRONE: 'ch_mavlink_to_drone_' // + DRONE_ID
        // message_buffer

    /*
        Канал для команд из браузера
            Pub
                pilot-server
            Sub
                DroneServer
     */
    ,DRONE_UI_COMMANDS: 'ch_commands_ui_drone_' // + DRONE_ID

    /*
        Канал для публикации изменений в текущую информацию о дроне
        После сохранения в DRONE_INFO_KEY
            redisClient.hset(RK.DRONE_INFO_KEY(drone_id), 'field', value [,'field2', value2])
        Нужно опубликовать в этот канал новые значения
            redisPub.publsh(RK.DRONE_INFO_CHANNEL(drone_id), JSON.stringify({field:value,field2:value2}))

            Pub
                DroneUDPProxy, GCSTCPProxy
            Sub
                DroneServer
     */
    ,DRONE_INFO_CHANNEL: 'ch_info_drone_' // + DRONE_ID

    // Канал куда отправляет состояние DroneUDPProxy дрона. Состояние отправляется при запуске и при остановке
    ,UDP_STATUS_CHANNEL: 'udp_status_chan_drone_' // + DRONE_ID  статус UDP сервера для каждого дрона
        /*
                в сообщении 1 или 0 = online или offline
        */

    /* */
    ,DJI_IO_FROM_DRONE: 'ch_dji_io_from_drone_' // + DRONE_ID

    /* */
    ,DJI_IO_TO_DRONE: 'ch_dji_io_to_drone_' // + DRONE_ID
    // message_buffer


    //
    // Browser <-> RPC routes
    ,DRONE_RPC: 'droneRPC_id_' // + DRONE_ID

    // Drone UDP Proxy controller
    ,DRONE_UDP_PROXY_START: 'controlDroneUDPProxy_start'
    ,DRONE_UDP_PROXY_STOP: 'controlDroneUDPProxy_stop'
    ,DRONE_UDP_PROXY_RESTART: 'controlDroneUDPProxy_restart'

    // Drone GCS TCP Proxy controller
    ,DRONE_GCS_TCP_PROXY_START: 'controlDroneGCSTCPProxy_start'
    ,DRONE_GCS_TCP_PROXY_STOP: 'controlDroneGCSTCPProxy_stop'
    ,DRONE_GCS_TCP_PROXY_RESTART: 'controlDroneGCSTCPProxy_restart'

};


const set_func = function(prefix){

    return function(id){
        if( !id ) id = '';
        return '' + keys_prefixes[prefix] + id;
    }

};

const redis_keys = {};

_.mapKeys(keys_prefixes, function (value, key) {
    redis_keys[key] = set_func(key);
});



module.exports = redis_keys;
