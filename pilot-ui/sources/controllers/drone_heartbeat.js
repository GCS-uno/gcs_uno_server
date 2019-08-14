export default function(drone_instance){
    let status = false; // false=stopped, true=started

    const intervals = {
        heartbeat: null
        ,joystick: null
    };

    const send_heartbeat = function(){
        drone_instance.command('gcs_heartbeat', {});
    };

    const send_joystick = function(){
        if( drone_instance.drone.isOnline() ) drone_instance.command('joystick', drone_instance.drone.joystick.get());
    };

    return {
        start: function(){
            status = true;
            send_heartbeat();
            if( intervals.heartbeat ) clearInterval(intervals.heartbeat);
            intervals.heartbeat = setInterval(send_heartbeat, 1000);

            if( !!drone_instance.drone_data.params.joystick_enable ){
                if( intervals.joystick ) clearInterval(intervals.joystick);
                intervals.joystick = setInterval(send_joystick, 100);
            }
        }
        ,stop: function(){
            status = false;
            if( intervals.heartbeat ) clearInterval(intervals.heartbeat);
            if( intervals.joystick ) clearInterval(intervals.joystick);
            intervals.heartbeat = null;
            intervals.joystick =null;
        }
        ,status: function(){
            return status;
        }
    }
}
