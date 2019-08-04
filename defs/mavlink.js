const FLIGHT_MODES = {

    3: { // ArduPilot
         plane: {
            0: {name: 'MANUAL', base: 1, custom: 0}
            ,1: {name: 'CIRCLE', base: 1, custom: 1}
            ,2: {name: 'STABILIZE', base: 1, custom: 2}
            ,3: {name: 'TRAINING', base: 1, custom: 3}
            ,4: {name: 'ACRO', base: 1, custom: 4}
            ,5: {name: 'FLY BY WIRE_A', base: 1, custom: 5}
            ,6: {name: 'FLY BY WIRE_B', base: 1, custom: 6}
            ,7: {name: 'CRUISE', base: 1, custom: 7}
            ,8: {name: 'AUTOTUNE', base: 1, custom: 8}
            ,10: {name: 'AUTO', base: 1, custom: 10}
            ,11: {name: 'RTL', base: 1, custom: 11}
            ,12: {name: 'LOITER', base: 1, custom: 12}
            ,14: {name: 'AVOID ADSB', base: 1, custom: 14}
            ,15: {name: 'GUIDED', base: 1, custom: 15}
            ,17: {name: 'QSTABILIZE', base: 1, custom: 17}
            ,18: {name: 'QHOVER', base: 1, custom: 18}
            ,19: {name: 'QLOITER', base: 1, custom: 19}
            ,20: {name: 'QLAND', base: 1, custom: 20}
            ,21: {name: 'QRTL', base: 1, custom: 21}
        }
        ,copter: {
             0: {name: 'Stabilize', base: 1, custom: 0}
            ,1: {name: 'Acro', base: 1, custom: 1}
            ,2: {name: 'Alt Hold', base: 1, custom: 2}
            ,3: {name: 'Auto', base: 89, custom: 3}
            ,4: {name: 'Guided', base: 81, custom: 4}
            ,5: {name: 'Loiter', base: 89, custom: 5}
            ,6: {name: 'RTL', base: 1, custom: 6}
            ,7: {name: 'Circle', base: 1, custom: 7}
            ,9: {name: 'Land', base: 217, custom: 9}
            ,11: {name: 'Drift', base: 1, custom: 11}
            ,13: {name: 'Sport', base: 1, custom: 13}
            ,14: {name: 'Flip', base: 1, custom: 14}
            ,15: {name: 'Autotune', base: 1, custom: 15}
            ,16: {name: 'Position Hold', base: 1, custom: 16}
            ,17: {name: 'Brake', base: 1, custom: 17}
            ,18: {name: 'Throw', base: 1, custom: 18}
            ,19: {name: 'Avoid ADSB', base: 1, custom: 19}
            ,20: {name: 'Guided No GPS', base: 1, custom: 20}
            ,21: {name: 'Smart RTL', base: 1, custom: 21}
            ,22: {name: 'Flow Hold', base: 89, custom: 22}
            ,23: {name: 'Follow Target', base: 89, custom: 23}
            ,24: {name: 'Zigzag', base: 89, custom: 24}
        }
        ,rover: {
             0: {name: 'MANUAL', base: 1, custom: 0}
            ,3: {name: 'STEERING', base: 1, custom: 3}
            ,4: {name: 'HOLD', base: 1, custom: 4}
            ,10: {name: 'AUTO', base: 1, custom: 10}
            ,11: {name: 'RTL', base: 1, custom: 11}
            ,15: {name: 'GUIDED', base: 1, custom: 15}
        }
        ,boat: {
            0: {name: 'STABILIZE', base: 1, custom: 0}
            ,1: {name: 'ACRO', base: 1, custom: 1}
            ,2: {name: 'ALT_HOLD', base: 1, custom: 2}
            ,3: {name: 'AUTO', base: 1, custom: 3}
            ,4: {name: 'GUIDED', base: 1, custom: 4}
            ,7: {name: 'CIRCLE', base: 1, custom: 7}
            ,9: {name: 'SURFACE', base: 1, custom: 9}
            ,16: {name: 'POSHOLD', base: 1, custom: 16}
            ,19: {name: 'MANUAL', base: 1, custom: 19}
        }
    }

    ,12: { // PX4
        plane: {}
        ,copter: {
            33816576: {name: 'Take off', base: 29, custom: 33816576}
            ,65536: {name: 'Manual', base: 209, custom: 65536} // 50593792
            ,458752: {name: 'Stabilize', base: 193, custom: 458752}
            ,327680: {name: 'Acro', base: 193, custom: 327680}
            ,524288: {name: 'Rattitude', base: 65, custom: 524288}
            ,131072: {name: 'Altitude', base: 209, custom: 131072}
            ,393216: {name: 'Offboard', base: 81, custom: 393216}
            ,50593792: {name: 'Hold', base: 157, custom: 50593792}
            ,196608: {name: 'Position', base: 89, custom: 196608}
            ,67371008: {name: 'Mission', base: 157, custom: 67371008}
            ,84148224: {name: 'RTL', base: 29, custom: 84148224}
            ,134479872: {name: 'Follow me', base: 29, custom: 134479872}
        }
        ,rover: {
            65536: {name: 'Manual', base: 209, custom: 65536} // 50593792
            ,458752: {name: 'Stabilize', base: 193, custom: 458752}
            ,327680: {name: 'Acro', base: 209, custom: 327680}
            ,524288: {name: 'Rattitude', base: 193, custom: 524288}
            ,131072: {name: 'Altitude', base: 193, custom: 131072}
            ,393216: {name: 'Offboard', base: 81, custom: 393216}
            ,196608: {name: 'Position', base: 157, custom: 196608}
            ,50593792: {name: 'Hold', base: 29, custom: 50593792}
            ,67371008: {name: 'Mission', base: 81, custom: 67371008}
            ,84148224: {name: 'RTL', base: 29, custom: 84148224}
            ,134479872: {name: 'Follow me', base: 29, custom: 134479872}
        }
        ,vtol: {}
    }

    ,generic_base: {
        1: {name: 'GENERIC MANUAL', base: 80, custom: 0}
        ,2: {name: 'GENERIC STABILIZE', base: 64, custom: 0}
        ,3: {name: 'GENERIC GUIDED', base: 88, custom: 0}
        ,4: {name: 'GENERIC AUTO', base: 92, custom: 0}
    }

};

const AUTOPILOTS = [
    /*  0 */ 'Generic 1' // full support for everything
    /*  1 */,'Reserved'
    /*  2 */,'SLUGS'
    /*  3 */,'ArduPilot'
    /*  4 */,'OpenPilot'
    /*  5 */,'Generic 2' // autopilot only supporting simple waypoints
    /*  6 */,'Generic 3' // autopilot supporting waypoints and other simple navigation commands
    /*  7 */,'Generic 4' // autopilot supporting the full mission command set
    /*  8 */,'GCS or MAVLink component' // No valid autopilot, e.g. a GCS or other MAVLink component
    /*  9 */,'PPZ UAV'
    /*  10 */,'UAV Dev Board'
    /*  11 */,'FlexiPilot'
    /*  12 */,'PX4'
    /*  13 */,'SMACCMPilot'
    /*  14 */,'AutoQuad'
    /*  15 */,'Armazila'
    /*  16 */,'Aerob'
    /*  17 */,'ASLUAV'
    /*  18 */,'SmartAP'
    /*  19 */,'AirRails'
];

const FRAME_TYPES = [
    /*  0 */['Generic MAV','other']
    /*  1 */,['Fixed wing plane','plane']
    /*  2 */,['Quadrotor','copter']
    /*  3 */,['Coaxial helicopter','copter']
    /*  4 */,['Tail rotor helicopter','copter']
    /*  5 */,['Ground installation','other']
    /*  6 */,['GCS','other']
    /*  7 */,['Airship','other']
    /*  8 */,['Free balloon','other']
    /*  9 */,['Rocket','other']
    /* 10 */,['Rover','rover']
    /* 11 */,['Boat','boat']
    /* 12 */,['Submarine','boat']
    /* 13 */,['Hexarotor','copter']
    /* 14 */,['Octorotor','copter']
    /* 15 */,['Tricopter','copter']
    /* 16 */,['Flapping wing','plane']
    /* 17 */,['Kite','other']
    /* 18 */,['Onboard companion','other']
    /* 19 */,['Two-rotor VTOL','vtol']
    /* 20 */,['Quad-rotor VTOL','vtol']
    /* 21 */,['Tiltrotor VTOL','vtol']
    /* 22 */,['VTOL 2','vtol']
    /* 23 */,['VTOL 3','vtol']
    /* 24 */,['VTOL 4','vtol']
    /* 25 */,['VTOL 5','vtol']
    /* 26 */,['Onboard gimbal','other']
    /* 27 */,['Onboard ADSB peripheral','other']
    /* 28 */,['Steerable airfoil','other']
    /* 29 */,['Dodecarotor','copter']
    /* 30 */,['Camera','other']
    /* 31 */,['Charging station','other']
    /* 32 */,['Onboard FLARM CAS','other']
];

const MAV_STATE = [
     'no init'
    ,'booting'
    ,'calibrating'
    ,'standby'
    ,'active'
    ,'critical'
    ,'mayday'
    ,'powering down'
    ,'terminating'
];

const LOG_ERRORS = {
     '20': 'Radio errors resolved'
    ,'22': 'Radio received no updates from receiver for 2 seconds'
    ,'30': 'Compass errors resolved'
    ,'31': 'Compass failed to initialise'
    ,'34': 'Compass unhealthy, failed to read from sensor'
    ,'50': 'Radio failsafe resolved'
    ,'51': 'Radio failsafe triggered'
    ,'60': 'Battery failsafe resolved'
    ,'61': 'Battery failsafe triggered'
    ,'80': 'GCS failsafe resolved'
    ,'81': 'GCS failsafe triggered'
    ,'90': 'Fence failsafe resolved'
    ,'91': 'Altitude fence breach, failsafe triggered'
    ,'92': 'Circular fence breach, failsafe triggered'
    ,'93': 'Both Alt and Circular fence breached, failsafe triggered'
    ,'94': 'Polygon fence breached, failsafe triggered'
    ,'110': 'GPS glitch cleared'
    ,'112': 'GPS glitch detected'
    ,'121': 'Crash into ground detected'
    ,'122': 'Loss of control detected'
    ,'132': 'Flip abandoned'
    ,'152': 'Parachute not deployed, vehicle too low'
    ,'153': 'Parachute not deployed, vehicle landed'
    ,'160': 'EKF variance cleared'
    ,'162': 'EKF position estimate bad'
    ,'170': 'EKF failsafe resolved'
    ,'171': 'EKF failsafe triggered'
    ,'180': 'Barometer errors resolved'
    ,'184': 'Barometer unhealthy'
    ,'190': 'CPU load failsafe resolved'
    ,'191': 'CPU load failsafe triggered'
    ,'200': 'ADSB Failsafe: Failsafe Resolved'
    ,'201': 'ADSB Failsafe: No action just report to Pilot'
    ,'202': 'ADSB Failsafe: Vehicle avoids by climbing or descending'
    ,'203': 'ADSB Failsafe: Vehicle avoids by moving horizontally'
    ,'204': 'ADSB Failsafe: Vehicle avoids by moving perpendicular to other vehicle'
    ,'205': 'ADSB Failsafe: RTL invoked'
    ,'212': 'Missing terrain data'
    ,'222': 'Navigation: Failed to set destination'
    ,'223': 'Navigation: RTL restarted'
    ,'224': 'Navigation: Circle initialisation failed'
    ,'225': 'Navigation: Destination outside fence'
    ,'230': 'Terrain failsafe resolved'
    ,'231': 'Terrain failsafe triggered'
    ,'240': '1st EKF has become primary'
    ,'241': '2nd EKF has become primary'
    ,'250': 'Thrust Restored'
    ,'251': 'Thrust Loss Detected '
};

const LOG_EVENTS = {
    7: 'Ap State'
    ,9: 'Init Simple Bearing'
    ,10: 'Armed'
    ,11: 'Disarmed'
    ,15: 'Auto Armed'
    ,17: 'Land Complete Maybe'
    ,18: 'Land Complete'
    ,28: 'Takeoff complete'
    ,19: 'Lost Gps'
    ,21: 'Flip Start'
    ,22: 'Flip End'
    ,25: 'Set Home'
    ,26: 'Set Simple On'
    ,27: 'Set Simple Off'
    ,29: 'Set Supersimple On'
    ,30: 'Autotune Initialised'
    ,31: 'Autotune Off'
    ,32: 'Autotune Restart'
    ,33: 'Autotune Success'
    ,34: 'Autotune Failed'
    ,35: 'Autotune Reached Limit'
    ,36: 'Autotune Pilot Testing'
    ,37: 'Autotune Savedgains'
    ,38: 'Save Trim'
    ,39: 'Savewp Add Wp'
    ,41: 'Fence Enable'
    ,42: 'Fence Disable'
    ,43: 'Acro Trainer Disabled'
    ,44: 'Acro Trainer Leveling'
    ,45: 'Acro Trainer Limited'
    ,46: 'Gripper Grab'
    ,47: 'Gripper Release'
    ,49: 'Parachute Disabled'
    ,50: 'Parachute Enabled'
    ,51: 'Parachute Released'
    ,52: 'Landing Gear Deployed'
    ,53: 'Landing Gear Retracted'
    ,54: 'Motors Emergency Stopped'
    ,55: 'Motors Emergency Stop Cleared'
    ,56: 'Motors Interlock Disabled'
    ,57: 'Motors Interlock Enabled'
    ,58: 'Rotor Runup Complete'
    ,59: 'Rotor Speed Below Critical'
    ,60: 'Ekf Alt Reset'
    ,61: 'Land Cancelled By Pilot'
    ,62: 'Ekf Yaw Reset'
    ,63: 'Avoidance Adsb Enable'
    ,64: 'Avoidance Adsb Disable'
    ,65: 'Avoidance Proximity Enable'
    ,66: 'Avoidance Proximity Disable'
    ,67: 'Gps Primary Changed'
    ,68: 'Winch Relaxed'
    ,69: 'Winch Length Control'
    ,70: 'Winch Rate Control'
};

module.exports = {
    FLIGHT_MODES,
    AUTOPILOTS,
    FRAME_TYPES,
    MAV_STATE,
    LOG_ERRORS,
    LOG_EVENTS
};
