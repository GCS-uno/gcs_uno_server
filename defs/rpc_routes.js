const common_config = require('../configs/common_config')
     ,{RPC} = require('../utils/redis')
     ,RK = require('../defs/redis_keys')
     ,_ = require('lodash')
     ,Logger = require('./../utils/logger')
     ,validators = require('./form_validators') // Form fields validators
     ,DroneModel = require('./../db_models/Drone') // Drone model
     ,FlightPlanModel = require('./../db_models/FlightPlan') // Полетные задания пилотов
     ,FlightPlanItemModel = require('./../db_models/FlightPlanItem')
     ,FlightLogModel = require('./../db_models/FlightLog');




const RPC_routes = {

    // Create new drone
    // returns NewDrone object
    droneCreate: function(values, resolve, reject){
        // Проверка названия дрона
        if( _.isObject(values) && _.has(values, 'name') ){

            // Random UDP port
            values.udp_port = _.random(common_config.DRONE_UDP_PORT_MIN, common_config.DRONE_UDP_PORT_MAX);
            values.gcs_tcp_port = _.random(common_config.GCS_TCP_PORT_MIN, common_config.GCS_TCP_PORT_MAX);

            // Проверка названия дрона
            if( !validators.drone.name.func(values.name) ){
                reject(validators.drone.name.longMessage);
                return;
            }

            // Create new drone
            const new_drone = new DroneModel(values);

            try {
                // Validate data
                new_drone.validate();

                // Save new drone
                new_drone.save()
                    .then(function(doc) {
                        Logger.info('new drone saved ' + doc.id);

                        // Response with success
                        resolve(doc.getView());

                    })
                    .catch( e => {
                        Logger.error(e);
                        reject('Saving error');
                    });

            }
            catch(e){
                // Response with error
                if( 'ValidationError' === e.name ){
                    Logger.warn('Drone create form validation failed');
                    Logger.warn(e);
                    reject('Form validation failed');
                }
                else {
                    Logger.error('Database error drone create');
                    Logger.error(e);
                    reject('Database error');
                }
            }

        } else {
            Logger.warn('Invalid data at drone create');
            reject('Invalid data');
        }
    },


    // List drones
    // returns array of Drones objects
    dronesList: function(data, resolve, reject){
        DroneModel.getList().run().then(function(result) {
            resolve(result);
        }).catch(function(err){
            Logger.error('get drones list error');
            Logger.error(err);
            reject('No data');
        });
    },


    // Get drones editable data
    // returns {values}
    droneGet: function(data, resolve, reject){
        if( _.isObject(data) && _.has(data, 'id') && data.id.length < 100 ){

            DroneModel.get(data.id.trim()).run()
                .then(function(drone) {
                    resolve(drone.getView());
                })
                .catch(function(){
                    reject('Drone not found in DB');
                });
        }
        else {
            Logger.warn('Invalid data at drone get');
            reject('Invalid data');
        }
    },


    // Save drone
    // resolves {values}, rejects Message
    droneSave: function(data, resolve, reject){
        if( _.isObject(data) && _.has(data, 'id') && data.id.trim().length < 100 && data.id.trim().length > 10){

            const drone_id = data.id.trim();

            DroneModel.get(drone_id).run()
                // Drone found
                .then(function(drone) {

                    try {
                        // Проверка названия дрона
                        if( _.has(data, 'name') && _.isString(data.name) ){
                            if( !validators.drone.name.func(data.name) ){
                                reject(validators.drone.name.longMessage);
                                return;
                            }

                            drone.name = data.name.trim();
                        }

                        // Drone UDP port
                        if( _.has(data, 'udp_port') ){

                            let udp_port = parseInt(data.udp_port.trim());
                            if( !validators.drone.udp_port.func(udp_port) ){
                                reject(validators.drone.udp_port.longMessage);
                                return;
                            }

                            drone.udp_port = udp_port;
                        }

                        // GCS TCP port
                        if( _.has(data, 'gcs_tcp_port') ){
                            let tcp_port = parseInt(data.gcs_tcp_port.trim());
                            if( !validators.drone.gcs_tcp_port.func(tcp_port) ){
                                reject(validators.drone.gcs_tcp_port.longMessage);
                                return;
                            }

                            drone.gcs_tcp_port = tcp_port;
                        }

                        // RTPS url
                        if( _.has(data, 'rtsp_video_url') ){
                            drone.rtsp_video_url = data.rtsp_video_url.trim();
                        }

                        // Проверка MAV SYS ID
                        if( _.has(data, 'mav_sys_id') ){
                            let mav_sys_id = parseInt(data.mav_sys_id);
                            if( mav_sys_id < 1 || mav_sys_id > 254 ){
                                reject('Board MAVLink system ID must be between 1 and 254');
                                return;
                            }

                            drone.mav_sys_id = mav_sys_id;
                        }

                        // Проверка MAV COMPONENT ID
                        if( _.has(data, 'mav_cmp_id') ){
                            let mav_cmp_id = parseInt(data.mav_cmp_id);

                            if( mav_cmp_id < 1 || mav_cmp_id > 254 ){
                                reject('Board MAVLink component ID must be between 1 and 254');
                                return;
                            }

                            drone.mav_cmp_id = mav_cmp_id;
                        }

                        // Проверка MAV GCS SYS ID
                        if( _.has(data, 'mav_gcs_sys_id') ){
                            let mav_gcs_sys_id = parseInt(data.mav_gcs_sys_id);
                            if( mav_gcs_sys_id < 100 || mav_gcs_sys_id > 255 ){
                                reject('GCS MAVLink system ID must be between 100 and 255');
                                return;
                            }

                            drone.mav_gcs_sys_id = mav_gcs_sys_id;
                        }

                        // Проверка MAV GCS COMPONENT ID
                        if( _.has(data, 'mav_gcs_cmp_id') ){
                            let mav_gcs_cmp_id = parseInt(data.mav_gcs_cmp_id);

                            if( mav_gcs_cmp_id < 0 || mav_gcs_cmp_id > 200 ){
                                reject('GCS MAVLink component ID must be between 0 and 200');
                                return;
                            }

                            drone.mav_gcs_cmp_id = mav_gcs_cmp_id;
                        }

                        // Джойстик
                        if( _.has(data, 'joystick_enable') ){

                            drone.joystick_enable = parseInt(data.joystick_enable) > 0 ? 1 : 0;

                            /* RC_OVERRIDE
                            if( parseInt(data.joystick_enable) > 0
                                && _.has(data, 'joystick_x_channel')
                                && _.has(data, 'joystick_y_channel')
                                && _.has(data, 'joystick_x_rev')
                                && _.has(data, 'joystick_y_rev') ){

                                let joystick_x_channel = parseInt(data.joystick_x_channel) || 0
                                    ,joystick_x_rev = parseInt(data.joystick_x_rev) ? 1 : 0
                                    ,joystick_y_channel = parseInt(data.joystick_y_channel) || 0
                                    ,joystick_y_rev = parseInt(data.joystick_y_rev) ? 1 : 0;

                                if( joystick_x_channel < 1 || joystick_x_channel > 18 ){
                                    joystick_x_channel = 0;
                                }

                                if( joystick_y_channel < 1 || joystick_y_channel > 18 ){
                                    joystick_y_channel = 0;
                                }

                                if( joystick_x_channel > 0 || joystick_y_channel > 0 ){
                                    if( joystick_x_channel === joystick_y_channel ){
                                        reject('RC channels must be different');
                                        return;
                                    }

                                    drone.joystick_enable = 1;
                                    drone.joystick_x_channel = joystick_x_channel;
                                    drone.joystick_x_rev = joystick_x_rev;
                                    drone.joystick_y_channel = joystick_y_channel;
                                    drone.joystick_y_rev = joystick_y_rev;
                                }
                                else {
                                    drone.joystick_enable = 0;
                                }
                            }
                            else {
                                drone.joystick_enable = 0;
                            }
                            */
                        }

                    }
                    catch( e ){
                        Logger.error(e);
                        return reject('Failed to validate');
                    }


                    //
                    // Saving data to DB
                    drone.save()
                        .then( saved_drone => resolve(saved_drone.getView()) )
                        .catch( err => {
                            Logger.error('Error saving drone');
                            Logger.error(err);
                            reject('Saving failed');
                        });

                })
                // Drone not found
                .catch(function(err){
                    Logger.error('drone to edit not found ' + data.id);
                    Logger.error(err);
                    reject('Drone not found');
                });

        }
        else {
            Logger.warn('Invalid data at drone save');
            reject('Invalid data');
        }
    },


    // Remove drone
    // resolves {id: ID}, rejects Message
    droneRemove: function(data, resolve, reject){
        if( _.isObject(data) && _.has(data, 'id') && data.id.length < 100 ){
            DroneModel.get(data.id).run().then(function(drone) {
                // Saving data to DB
                drone.delete().then(function(doc){
                    resolve({id: data.id});
                }).catch(function(err){
                    Logger.error('Drone remove failed ' + data.id);
                    Logger.error(err);
                    reject('Drone remove failed');
                });

            }).catch( err => {
                Logger.error('Drone remove failed (2) ' + data.id);
                Logger.error(err);
                reject('Drone remove failed');
            });
        }
        else {
            Logger.warn('Invalid data at drone remove');
            reject('Invalid data');
        }

    },


    //
    //     Запросы для DroneServer
    //
    //
    // Start Drone UDP
    droneStartUDP: function(data, resolve, reject){
        if( !data || !data.drone_id ) return reject('no data');

        RPC.req(RK.START_DRONE_UDP(data.drone_id), {})
            .then( resolve )
            .catch( reject );
    },

    //
    // Stop Drone UDP
    droneStopUDP: function(data, resolve, reject){
        if( !data || !data.drone_id ) return reject('no data');

        RPC.req(RK.STOP_DRONE_UDP(data.drone_id), {})
            .then( resolve )
            .catch( reject );
    },

    //
    // Start GCS TCP
    droneStartGCSTCP: function(data, resolve, reject){
        if( !data || !data.drone_id ) return reject('no data');

        RPC.req(RK.START_GCS_TCP(data.drone_id), {})
            .then( resolve )
            .catch( reject );
    },

    //
    // Stop GCS TCP
    droneStopGCSTCP: function(data, resolve, reject){
        RPC.req(RK.STOP_GCS_TCP(data.drone_id), {})
            .then( resolve )
            .catch( reject );
    },



    //
    //     Полетные планы
    //

    //
    // Список полетных планов
    fpList: function(data, resolve, reject){
        FlightPlanModel.orderBy(FlightPlanModel.r().desc('createdAt')).getList().run()
            .then( resolve )
            .catch( reject );
    },

    //
    // Создание нового полетного плана
    fpCreate: function(data, resolve, reject){
        // Create new mission
        const new_fp = new FlightPlanModel({
            name: 'New flight plan'
        });

        try {
            new_fp.validate();
            new_fp.save().then(function(doc) {
                resolve({
                     id: doc.id
                    ,name: doc.name
                });
            }).error( reject );
        }
        catch(e) {
            reject(e);
        }
    },

    //
    // Загрузка данных одного плана {id: plan_ID}
    fpGet: function(data, resolve, reject){
        FlightPlanModel.get(data.id).getJoin({
                items: {
                    _apply: function(sequence) {
                        return sequence.orderBy('seq')
                    }
                }
            }).run()
            .then( plan => resolve( plan.getView() ) )
            .catch( reject );
    },

    //
    // Редактирование параметров задания
    fpSave: function(data, resolve, reject){
        FlightPlanModel.get(data.id).run()
            .then( plan => {

                // Название задания
                if( data.name && data.name.length > 2 && data.name.length <= 50 ){
                    plan.name = data.name;
                }

                // Центр и зум карты
                if( data.map_center && data.map_zoom ){
                    let {lat, lng} = data.map_center;
                    if( lat && lng ){
                        let zoom = parseInt(data.map_zoom);
                        if( zoom <= 0 || zoom >= 30 ) zoom = 15;

                        plan.map = { center: {latitude: lat, longitude: lng}, zoom: zoom };
                    }
                }

                // Высота взлета
                if( _.has(data, 'takeoff_alt') ){
                    let alt = parseInt(data.takeoff_alt);
                    if( alt > 0 ){
                        if( alt > 1000 ) alt = 1000;
                    }
                    else alt = 0;

                    plan.takeoff_alt = alt;
                }

                // Начальная скорость
                if( _.has(data, 'init_speed') ){
                    let init_speed = parseInt(data.init_speed);
                    if( init_speed > 0 ){
                        if( init_speed > 1000 ) init_speed = 1000;
                    }
                    else init_speed = 0;

                    plan.init_speed = init_speed;
                }

                // Возврат в точку старта
                if( _.has(data, 'rtl_end') ){
                    plan.rtl_end = !!parseInt(data.rtl_end);
                }

                // Строка местоположения
                if( data.location && data.location.length > 1 ){
                    plan.location = data.location.substr(0,100);
                }

                // Точка старта
                if( data.home ){ //return reject('test');
                    let {lat, lng} = data.home;
                    if( lat && lng ){
                        plan.home = {latitude: lat, longitude: lng};
                    }
                }

                try {
                    // Сохранение данных
                    plan.save()
                        .then( saved_plan => resolve(saved_plan.getView()) )
                        .catch( function(e){
                            console.log('HERE 1', e);
                            reject();
                        } );
                }
                catch (e){
                    console.log('HERE 2', e);
                    reject(e);
                }

            })

            .catch( function(e){
                console.log('HERE 3', e);
                reject();
            } );
    },

    //
    // Создание новой точки в задании
    fpItemCreate: function(data, resolve, reject){
        FlightPlanModel.get(data.id).getJoin({
                items: {
                    _apply: function(sequence) {
                        return sequence.orderBy('seq')
                    }
                }
            }).run()
            .then( plan => {

                // Определим порядковый номер под которым будет сохраняться точка в плане
                // Если в плане нет точек, то порядковый номер = 1
                let next_seq = plan.items.length ? plan.items[plan.items.length-1].seq + 1 : 1;

                // Точка может быть сохранена с явно указанным SEQ
                let item_seq = _.has(data, 'seq') ? parseInt(data.seq) : next_seq;

                // item_seq не может быть меньше 1
                if( item_seq < 1 ) return reject('item seq below 1');

                const float_or_null = function(value){
                    value = parseFloat(value);
                    return isNaN(value) ? null : value;
                };

                //
                // Сохранение элемента после подготовки
                const save_item = function(){

                    let  param1 = float_or_null(data.param1)
                        ,param2 = float_or_null(data.param2)
                        ,param3 = float_or_null(data.param3)
                        ,param4 = float_or_null(data.param4)
                        ,param5 = float_or_null(data.param5)
                        ,param6 = float_or_null(data.param6)
                        ,param7 = float_or_null(data.param7)
                        ,frame = parseInt(data.frame) || 0
                        ,command = parseInt(data.command) || 0
                        ,position = null;


                    // Создаем объект точки
                    if( param5 && param6 ) position = [param6, param5];

                    // Создаем новую точку в задании
                    const mission_item = new FlightPlanItemModel({
                        flight_plan_id: plan.id
                        ,seq: item_seq
                        ,position: position
                        ,command: command
                        ,frame: frame
                        ,param1: param1
                        ,param2: param2
                        ,param3: param3
                        ,param4: param4
                        ,param5: param5
                        ,param6: param6
                        ,param7: param7
                    });

                    try {
                        mission_item.save()
                            .then( saved_item => {
                                resolve({seq: saved_item.seq})
                            } )
                            .catch( e => {
                                reject(e);
                            } );
                    }
                    catch (e){
                        reject(e);
                    }

                };

                // Если есть seq и он следующий по очереди, то сохраняем
                // А если нет, то нужно сначала пересохранить элементы после этой точки
                const r = FlightPlanItemModel.r();

                // Если порядковый номер добавляемой точки меньше следующего порядкового
                // то нужно переписать порядковые номера у точек, которые находятся за ней
                if( item_seq < next_seq ){
                    FlightPlanItemModel
                        .filter(function(item){
                            // фильтр по точкам в плане с порядковым номером >= item_seq
                            return item('flight_plan_id').eq(plan.id).and(item('seq').ge(item_seq))
                        })
                        // Увеличиваем на 1 seq этих точек
                        .update({seq: r.row("seq").add(1)}).run()
                        // Потом сохраняем текущую точку
                        .then( save_item )
                        .catch( reject );
                }
                // Если точка по порядку, то просто сохраняем ее
                else save_item();


            })
    },

    //
    // Редактирование точки в задании
    fpItemUpdate: function(data, resolve, reject){

        // Берем из БД точку по ее seq и ID ее полетного пдана
        FlightPlanModel.get(data.id).getJoin({ // plan_id
                items: {
                    _apply: function(sequence) {
                        return sequence.filter({seq: parseInt(data.seq)})
                    }
                }
            }).run()
            .then( plan => {
                // на выходе должна быть одна точка
                if( plan.items.length === 1 ){

                    // TODO Проверка входящих значений у параметров для разных команд

                    if( data.command ) plan.items[0].command = parseInt(data.command) || 0;
                    if( data.frame ) plan.items[0].frame = parseInt(data.frame) || 0;
                    if( data.param1 ) plan.items[0].param1 = parseInt(data.param1) || null;
                    if( data.param2 ) plan.items[0].param2 = parseInt(data.param2) || null;
                    if( data.param3 ) plan.items[0].param3 = parseInt(data.param3) || null;
                    if( data.param4 ) plan.items[0].param4 = parseInt(data.param4) || null;
                    if( data.param5 ) plan.items[0].param5 = parseFloat(data.param5) || null;
                    if( data.param6 ) plan.items[0].param6 = parseFloat(data.param6) || null;
                    if( data.param7 ) plan.items[0].param7 = parseFloat(data.param7) || 0;

                    if( plan.items[0].param5 && plan.items[0].param6 ) plan.items[0].position = [plan.items[0].param6, plan.items[0].param5];

                    try {
                        plan.saveAll()
                            .then( saved_plan => resolve({seq: data.seq}) )
                            .error( reject );
                    }
                    catch (e){
                        reject(e);
                    }
                }
                else {
                    reject('error item seq ' + data.seq);
                }

            })
    },

    //
    // Удаление точки из задания
    fpItemRemove: function(data, resolve, reject1){

        const reject = function(e){
            console.log(e);
            reject1(e);
        };

        let seq = parseInt(data.seq);
        if( !seq || seq <= 0 ) return reject('wrong point seq');


        // Сначала достанем точку, которую нужно удалить
        FlightPlanItemModel
            .filter({
                flight_plan_id: data.id // plan ID
                ,seq: seq // item seq
            })
            //.getJoin({flight_plan: true})
            .run().then( result => {

                // Если нашлась точка с нужным порядковым номером
                if( result.length ){

                    // Удаляем эту точку
                    result[0].delete().then(function(r){

                        // Потом находим все остальные точки у этого задания
                        FlightPlanModel.get(data.id).getJoin({
                                items: {
                                    _apply: function(sequence) {
                                        return sequence.orderBy('seq')
                                    }
                                }
                            })
                            .run().then( plan => {

                                // Перебираем все точки и у каждой принудительно ставим порядковый номер
                                for( let i = 0, k = plan.items.length; i < k; i++ ){
                                    plan.items[i].seq = i+1;
                                }

                                try {
                                    // И сохраняем все сразу
                                    plan.saveAll().then( saved_plan => resolve(true) ).catch( reject );
                                }
                                catch( e ){
                                    reject(e);
                                }

                            })

                            .catch( e => reject(e) );

                    }).catch( e => reject(e) );

                }

                else {
                    reject('point not found ' + seq);
                }

            })
            .catch( reject );
    },

    //
    // Удаление всего задания
    fpRemove: function(data, resolve, reject){
        FlightPlanModel.get(data.id)
            .run().then( plan => {
                plan.deleteAll({items: true}).then( r => resolve({id: data.id}) ).catch( reject );
            })

            .catch( reject );
    },



    //
    //     Логи
    //

    //
    // Список логов
    logsList: function(data, resolve, reject){
        FlightLogModel.getList().run().then(function(result) {
            resolve(result);
        }).catch(function(err){
            Logger.error('get logs list error');
            Logger.error(err);
            reject('No data');
        });
    },

    //
    // TODO Загрузка данных одного лога {id: log_ID}
    logGet: function(data, resolve, reject){
        if( !_.has(data, 'id') ){
            reject('no id');
            return;
        }

        FlightLogModel.get(data.id.trim()).run()
            .then(function(log) {

                let fields = {};

                try {

                    const spawn = require("child_process").spawn;

                    const pyprocess = spawn('python',["./../utils/pymavlink/DFReader.py",
                        './../logs/' + log.bin_file] );

                    let i = 0;

                    let parsed_strings = '';

                    // Takes stdout data from script which executed
                    // with arguments and send this data to res object
                    pyprocess.stdout.on('data', function(data) {
                        parsed_strings = parsed_strings + data;
                    } );
                    pyprocess.stdout.on('close', function() {

                        let sf = parsed_strings.split("#$#");

                        let m_list = {};
                        let start_time = null;
                        let finish_time = 0;

                        // Раскидать сообщения по группам
                        _.each(sf, function(line, ind){

                            let ls = line.replace('NaN', '""');

                            try {
                                let m = JSON.parse(ls);

                                if( _.has(m, 'mavpackettype') ){
                                    if( _.has(m_list, m['mavpackettype']) ){
                                        m_list[m['mavpackettype']].push(m);
                                    }
                                    else {
                                        m_list[m['mavpackettype']] = [m];
                                    }

                                    if( _.has(m, 'TimeUS') ){
                                        let timeus = parseInt(m['TimeUS']);
                                        if( !start_time ) start_time = timeus;
                                        if( timeus > finish_time ) finish_time = timeus;
                                    }
                                }

                            }
                            catch (err ){
                                console.log('ERR', ind);
                                console.log(ls);
                            }
                        });

                        let log_time = Math.round((finish_time-start_time)/1000000);

                        /* Распечатать список групп и полей
                        _.mapKeys(m_list, (value, key) => {
                            //console.log(key, value.length);
                            console.log(key);
                            _.mapKeys(value[0], function(v,k){
                                if( 'TimeUS' !== k && 'mavpackettype' !== k ) console.log('    ' + k);
                            });
                        });
                         */

                        console.log('Log time, sec: ', log_time);
                        console.log('Cache size KB', Math.round(parsed_strings.length/1024));

                        // Выбрать данные по высоте
                        // POS.RelHomeAlt
                        let group = 'POS';
                        let field = 'RelHomeAlt';
                        let freq = 5;

                        let chart_data = [];

                        if( _.has(m_list, group) ){
                            let min_alt = 0;
                            let max_alt = 0;
                            let prev_rec_time = -1;

                            _.each(m_list[group], (rec) => {
                                let alt = parseFloat(rec[field]).toFixed(2);
                                if( alt < min_alt ) min_alt = alt;
                                if( alt > max_alt ) max_alt = alt;

                                let rec_time = Math.round((parseInt(rec['TimeUS'])-start_time)/(1000000/freq));

                                if( rec_time > prev_rec_time ){
                                    chart_data.push({time: rec_time, alt: alt});
                                    prev_rec_time = rec_time;
                                }

                            });

                            console.log('CL', chart_data.length, min_alt, max_alt);
                        }

                        resolve({ info: 'info', alt_chart: chart_data });

                    } );
                    pyprocess.stdout.on('end', function() {
                        //console.log('END');
                    } );
                    pyprocess.stdout.on('error', function() {
                        console.log('ERROR');
                        reject('Bin parse error');
                    } );


                }
                catch( err ){
                    console.log('ERR', err);
                    reject('Bin parse error');
                }

            })
            .catch(function(){
                reject('Log not found in DB');
            });
    }


};

module.exports = RPC_routes;
