module.exports = {

    NIMBLE_STREAMING_SERVER: 'demo123.gcs.uno'
    // Host + Port (optional). WITHOUT protocol statement (e.g. 10.10.10.10:8081)
    // Leave empty if nimble runs on the same host with default port 8081

    ,NIMBLE_STREAMING_APP: 'vs'
    // streaming app name

    ,DRONE_UDP_PORT_MIN: 30000
    /* UDP port will be assigned between these values */
    ,DRONE_UDP_PORT_MAX: 40000

    ,GCS_TCP_PORT_MIN: 50000
    /* TCP port will be assigned between these values */
    ,GCS_TCP_PORT_MAX: 60000

};
