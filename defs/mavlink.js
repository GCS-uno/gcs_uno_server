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
            0: {name: 'STABILIZE', base: 1, custom: 0}
            ,1: {name: 'ACRO', base: 1, custom: 1}
            ,2: {name: 'ALT HOLD', base: 1, custom: 2}
            ,3: {name: 'AUTO', base: 1, custom: 3}
            ,4: {name: 'GUIDED', base: 1, custom: 4}
            ,5: {name: 'LOITER', base: 1, custom: 5}
            ,6: {name: 'RTL', base: 1, custom: 6}
            ,7: {name: 'CIRCLE', base: 1, custom: 7}
            ,9: {name: 'LAND', base: 1, custom: 9}
            ,11: {name: 'DRIFT', base: 1, custom: 11}
            ,13: {name: 'SPORT', base: 1, custom: 13}
            ,14: {name: 'FLIP', base: 1, custom: 14}
            ,15: {name: 'AUTOTUNE', base: 1, custom: 15}
            ,16: {name: 'POSHOLD', base: 1, custom: 16}
            ,17: {name: 'BRAKE', base: 1, custom: 17}
            ,18: {name: 'THROW', base: 1, custom: 18}
            ,19: {name: 'AVOID ADSB', base: 1, custom: 19}
            ,20: {name: 'GUIDED NOGPS', base: 1, custom: 20}
            ,21: {name: 'SMART RTL', base: 1, custom: 21}
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
    'noinit'
    ,'booting'
    ,'calibrating'
    ,'standby'
    ,'active'
    ,'critical'
    ,'mayday'
    ,'powering_down'
    ,'terminating'
];

module.exports = {
    FLIGHT_MODES,
    AUTOPILOTS,
    FRAME_TYPES,
    MAV_STATE
};
