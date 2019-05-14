const common_config = require('../configs/common_config');

//
// Form field validators
// !! Used in back and front end

const form_validators = {
    drone: {
        name: {
            func: function(value){
                return /^([a-zA-Z0-9\s]{2,50})$/.test(value.trim())
            }
            ,shortMessage: 'need 2-50 characters a-z, 0-9, - and [space]'
            ,longMessage: 'Drone name must be 2-50 characters in length (a-z, 0-9)'
        }

        // udp port
        ,udp_port: {
            func: function(value){
                return (value >= common_config.DRONE_UDP_PORT_MIN && value <= common_config.DRONE_UDP_PORT_MAX);
            }
            ,shortMessage: 'UDP port range ' + common_config.DRONE_UDP_PORT_MIN + '-' + common_config.DRONE_UDP_PORT_MAX
            ,longMessage: 'Drone UDP port range ' + common_config.DRONE_UDP_PORT_MIN + '-' + common_config.DRONE_UDP_PORT_MAX
        }

        // GCS tcp port
        ,gcs_tcp_port: {
            func: function(value){
                return (value >= common_config.GCS_TCP_PORT_MIN && value <= common_config.GCS_TCP_PORT_MAX);
            }
            ,shortMessage: 'TCP port range ' + common_config.GCS_TCP_PORT_MIN + '-' + common_config.GCS_TCP_PORT_MAX
            ,longMessage: 'GCS TCP port range ' + common_config.GCS_TCP_PORT_MIN + '-' + common_config.GCS_TCP_PORT_MAX
        }

        // rtsp url

        // mav ids

        // joysticks

    }
};

module.exports = form_validators;
