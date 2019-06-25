module.exports = {

    NIMBLE_STREAMING_SERVER: ''
    // Host + Port (optional) + Path. WITHOUT protocol statement (e.g. 10.10.10.10:8081/vs/)
    // Leave empty if nimble runs on the same host

    ,DRONE_UDP_PORT_MIN: 30000
    /* UDP port will be assigned between these values */
    ,DRONE_UDP_PORT_MAX: 40000

    ,GCS_TCP_PORT_MIN: 50000
    /* TCP port will be assigned between these values */
    ,GCS_TCP_PORT_MAX: 60000

};
