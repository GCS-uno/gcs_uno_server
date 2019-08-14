const common_config = require('../configs/common_config')
     ,{RPC} = require('../utils/redis')
     ,RK = require('../defs/redis_keys')
     ,MAVLINK_DEF = require('../defs/mavlink')
     ,{LOG_ERRORS, LOG_EVENTS} = require('../defs/mavlink')
     ,_ = require('lodash')
     ,Logger = require('./../utils/logger')
     ,fs = require('fs')
     ,async = require("async")
     ,helpers = require('./../utils/helpers')
     ,validators = require('./form_validators') // Form fields validators
     ,DroneModel = require('./../db_models/Drone') // Drone model
     ,FlightPlanModel = require('./../db_models/FlightPlan') // Полетные задания пилотов
     ,FlightPlanItemModel = require('./../db_models/FlightPlanItem')
     ,DataFlashLogModel = require('../db_models/DataFlashLog');


const log_err_msg = function(subsys, ecode){
    let msg = '';
    if( 10 === subsys ) msg = 'Mode set failed ' + ecode;
    else if( _.has(LOG_ERRORS, '' + subsys + ecode) ) msg = LOG_ERRORS['' + subsys + ecode];
    else msg = 'Unknown error ' + subsys + '.' + ecode;
    return msg;
};

const log_event_msg = function(ev_id){
    if( _.has(LOG_EVENTS, ev_id) ) return LOG_EVENTS[ev_id];
    else return 'Unknown event #' + ev_id;
};


const RPC_routes = {

    // Create new drone
    // returns NewDrone object
    droneCreate: function(values, resolve, reject){
        // Проверка названия дрона
        if( _.isObject(values) && _.has(values, 'name') ){

            let new_drone_data = {};

            console.log(values);

            if( values.type === "dji" ) new_drone_data.type = "dji";
            else if( values.type === "mavlink" ) new_drone_data.type = "mavlink";
            else return reject("Invalid type");

            // Проверка названия дрона
            if( !validators.drone.name.func(values.name) ) return reject(validators.drone.name.longMessage);

            new_drone_data.name = values.name.trim();


            if( new_drone_data.type === "mavlink" ){
                // Random UDP port
                new_drone_data.udp_port = _.random(common_config.DRONE_UDP_PORT_MIN, common_config.DRONE_UDP_PORT_MAX);
                new_drone_data.gcs_tcp_port = _.random(common_config.GCS_TCP_PORT_MIN, common_config.GCS_TCP_PORT_MAX);
            }

            if( new_drone_data.type === "dji" ){
                new_drone_data.dji_model = "new";
                new_drone_data.dji_fc_serial = "new";
            }

            // Create new drone
            const new_drone = new DroneModel(new_drone_data);

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

                        // Если это mavlink дрон
                        if( drone.type === "mavlink" ){
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

                            // Загрузка лога после дизарма
                            if( _.has(data, 'dl_log_on_disarm') ) drone.dl_log_on_disarm = parseInt(data.dl_log_on_disarm) > 0 ? 1 : 0;

                        }

                        // Video streams
                        if( _.has(data, 'video_stream_1') ) drone.video_stream_1 = data.video_stream_1.trim();
                        if( _.has(data, 'video_stream_2') ) drone.video_stream_2 = data.video_stream_2.trim();
                        if( _.has(data, 'video_stream_3') ) drone.video_stream_3 = data.video_stream_3.trim();

                        // Джойстик
                        if( _.has(data, 'joystick_enable') ) drone.joystick_enable = parseInt(data.joystick_enable) > 0 ? 1 : 0;

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
    // Drone RPC
    droneRPC: function(data, resolve, reject){
        if( !_.has(data, 'drone_id') || !_.has(data, 'method') ) return reject('Invalid request');

        if( !_.has(data, 'data') ) data.data = {};
        RPC.req(RK.DRONE_RPC(data.drone_id), {method: data.method, data: data.data})
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

        try {
            async.parallel({
                drones: DroneModel.orderBy('id').bindRun(),
                logs: DataFlashLogModel.orderBy('id').bindRun()
            }).then((dataset) => {
                // Список имен дронов
                let drones_names = {};
                _.each(dataset.drones, rec => {  drones_names[rec.id] = rec.name; });

                let logs_list = [];

                _.each(dataset.logs, rec => {
                    logs_list.push({
                         id: rec.id
                        ,date: rec.createdAt
                        ,d_name: ( rec.drone_id && _.has(drones_names, rec.drone_id) ? drones_names[rec.drone_id] : '')
                        ,gps_ts: rec.gps_time || ''
                        ,location: rec.location || ''
                        ,l_time: helpers.readable_seconds(rec.l_time || 0)
                    });
                });

                resolve(logs_list);

            }).catch( err => {
                Logger.error('Failed to load data');
                Logger.error(err);
                reject('Failed to load data');
            });
        }
        catch(e){
            console.log(e);
            reject('Failed to load data');
        }
    },

    //
    // Загрузка данных одного лога {id: log_ID}
    logGet: function(data, resolve, reject){
        if( !_.has(data, 'id') ){
            reject('no id');
            return;
        }

        let check_point_time = helpers.now_ms();

        DataFlashLogModel.get(data.id.trim()).run()
            .then(function(log) {

                try {

                    fs.readFile(__dirname + '/../logs/' + log.bin_file + '.json', (err, data) => {
                        if (err) {
                            console.log('FS err', err);
                            console.log();
                            return reject('Failed to read file');
                        }

                        let log_msgs = JSON.parse(data);

                        let m_list = {};
                        let start_time = null;
                        let end_time = 0;
                        let info = {
                             type: 'Unknown'
                            ,l_time: helpers.readable_seconds(log.l_time)
                            ,gps_time: log.gps_time
                            ,location: log.location
                            ,lat: log.location_point.coordinates[1]
                            ,lon: log.location_point.coordinates[0]
                        };

                        let log_modes = {};
                        let log_modes_timeline = [];
                        let msgs_tree_data = [];

                        // Раскидать сообщения по группам
                        _.each(log_msgs, function(m, ind){
                            try {
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
                                        if( timeus > end_time ) end_time = timeus;
                                    }
                                }
                                else {
                                    console.log('NO TYPE', m);
                                }

                            }
                            catch (err ){
                                console.log('ERR', ind, err);
                                //console.log(ls);
                            }
                        });

                        //info.log_time = Math.round((end_time-start_time)/1000000);

                        //
                        // Сделать дерево сообщений
                        _.mapKeys(m_list, (series, m_type) => {
                            // Игнорируем системные сообщения
                            if( ['FMT', 'UNIT', 'MULT', 'FMTU', 'PARM', 'MSG', 'ERR', 'EV', 'MODE', 'CMD'].includes(m_type) ) return;

                            let msg_type = { id: m_type, value: m_type, data: [] };
                            _.mapKeys(series[0], function(value, field){
                                if( 'TimeUS' === field || 'mavpackettype' === field ) return;

                                msg_type.data.push({ id: m_type+'.'+field, value: field});
                            });
                            msgs_tree_data.push(msg_type);
                        });

                        // Lat, Lng
                        let pos_data = {
                            gps: []
                            ,pos: []
                        };

                        //
                        // GPS
                        if( _.has(m_list, 'GPS') ){
                            let prev_rec_point_5hz = -1;
                            let prev_rec_point_1hz = -1;
                            let init_alt = null;

                            _.each(m_list['GPS'], (rec) => {
                                let rec_point_1hz = Math.round((parseInt(rec['TimeUS'])-start_time)/1000000);
                                let rec_point_5hz = Math.round((parseInt(rec['TimeUS'])-start_time)/(1000000/5));

                                let  alt = parseFloat(rec['Alt']).toFixed(2);
                                if( null === init_alt ) init_alt = alt;
                                let rel_alt = (alt - init_alt).toFixed(2);

                                // 1 Hz
                                // Точно следующая точка
                                if( rec_point_1hz-prev_rec_point_1hz === 1 ){
                                    pos_data.gps.push({lat: parseFloat(rec['Lat']), lng: parseFloat(rec['Lng'])});
                                }
                                // Пропуск точки, заполняем текущими данными
                                else if( rec_point_1hz > prev_rec_point_1hz ){
                                    for( let i = 1, k = rec_point_1hz-prev_rec_point_1hz; i <= k; i++ ){
                                        pos_data.gps.push({lat: parseFloat(rec['Lat']), lng: parseFloat(rec['Lng'])});
                                    }
                                }

                                prev_rec_point_5hz = rec_point_5hz;
                                prev_rec_point_1hz = rec_point_1hz;
                            });
                        }
                        else {
                            console.log('No GPS');
                        }

                        //
                        // POS
                        if( _.has(m_list, 'POS') ){
                            let prev_rec_point_5hz = -1;
                            let prev_rec_point_1hz = -1;

                            _.each(m_list['POS'], (rec) => {
                                let rec_point_1hz = Math.round((parseInt(rec['TimeUS'])-start_time)/1000000);
                                let rec_point_5hz = Math.round((parseInt(rec['TimeUS'])-start_time)/(1000000/5));

                                let  alt = parseFloat(rec['RelHomeAlt']).toFixed(2);

                                // 1 Hz
                                // Точно следующая точка
                                if( rec_point_1hz-prev_rec_point_1hz === 1 ){
                                    pos_data.pos.push({lat: parseFloat(rec['Lat']), lng: parseFloat(rec['Lng'])});
                                }
                                // Пропуск точки, заполняем текущими данными
                                else if( rec_point_1hz > prev_rec_point_1hz ){
                                    for( let i = 1, k = rec_point_1hz-prev_rec_point_1hz; i <= k; i++ ){
                                        pos_data.pos.push({lat: parseFloat(rec['Lat']), lng: parseFloat(rec['Lng'])});
                                    }
                                }

                                prev_rec_point_5hz = rec_point_5hz;
                                prev_rec_point_1hz = rec_point_1hz;
                            });
                        }

                        //
                        // ERR errors
                        let err_data = []; // [{t: time, msg: err_msg}]
                        if( _.has(m_list, 'ERR') ){
                            _.each(m_list['ERR'], (rec) => {

                                let err_time = parseInt(rec['TimeUS'])-start_time;
                                err_data.push({t: err_time, msg: log_err_msg(parseInt(rec['Subsys']), parseInt(rec['ECode']))});

                            });
                        }

                        //
                        // EV events
                        let events_data = []; // {t: time, ev: event}
                        if( _.has(m_list, 'EV') ){
                            _.each(m_list['EV'], (rec) => {

                                let time = Math.round((parseInt(rec['TimeUS'])-start_time)/1000000);
                                events_data.push({t: time, ev: log_event_msg(parseInt(rec['Id']))});

                            });
                        }

                        //
                        // MSG
                        let msgs_data = []; // {t: time, msg: msg}
                        if( _.has(m_list, 'MSG') ){
                            _.each(m_list['MSG'], (rec) => {

                                let time = Math.round((parseInt(rec['TimeUS'])-start_time)/1000000);
                                msgs_data.push({t: time, msg: rec['Message']});

                                if( rec['Message'].includes('Rover') ){
                                    info.type = 'ArduRover';
                                    log_modes = MAVLINK_DEF.FLIGHT_MODES[3].rover;
                                }
                                else if( rec['Message'].includes('Plane') ){
                                    info.type = 'ArduPlane';
                                    log_modes = MAVLINK_DEF.FLIGHT_MODES[3].plane;
                                }
                                else if( rec['Message'].includes('Copter') ){
                                    info.type = 'ArduCopter';
                                    log_modes = MAVLINK_DEF.FLIGHT_MODES[3].copter;
                                }
                                else if( rec['Message'].includes('Antenna') ){
                                    info.type = 'Ardupilot Antenna Tracker';
                                }
                                else if( rec['Message'].includes('ArduSub') ){
                                    info.type = 'ArduSub';
                                    log_modes = MAVLINK_DEF.FLIGHT_MODES[3].boat;
                                }

                            });
                        }

                        //
                        // MODE
                        if( _.has(m_list, 'MODE') ){
                            let current_mode = null;
                            _.each(m_list['MODE'], (rec) => {
                                let mode_num = parseInt(rec['ModeNum']);
                                let time = Math.round((parseInt(rec['TimeUS'])-start_time)/10000);
                                let mode_name = '';
                                if( _.has(log_modes, mode_num) ){
                                    mode_name = log_modes[mode_num].name;
                                }
                                else {
                                    mode_name = 'Mode ' + mode_num;
                                }

                                if( !current_mode ){
                                    current_mode = {num: mode_num, name: mode_name, start: time};
                                }
                                else {
                                    if( mode_num !== current_mode.num ){
                                        log_modes_timeline.push({
                                            num: current_mode.num
                                            ,name: current_mode.name
                                            ,start: current_mode.start
                                            ,end: time
                                        });
                                        current_mode = {num: mode_num, name: mode_name, start: time};
                                    }
                                }
                            });
                            log_modes_timeline.push({
                                num: current_mode.num
                                ,name: current_mode.name
                                ,start: current_mode.start
                                ,end: Math.round((end_time-start_time)/10000)
                            });

                        }

                        //
                        // Отправка данных в браузер
                        resolve({
                             info: info
                            ,pos_gps: pos_data.gps
                            ,pos_pos: pos_data.pos
                            ,errors: err_data
                            ,messages: msgs_data
                            ,events: events_data
                            ,modes: log_modes_timeline
                            ,msg_tree: msgs_tree_data
                        });

                        console.log('Total process time: ' + (helpers.now_ms()-check_point_time));

                    });

                }
                catch( err ){
                    console.log('ERR', err);
                    reject('Bin parse error');
                }

            })
            .catch(function(){
                reject('Log not found in DB');
            });
    },

    //
    // Загрузка данных одного лога {id: log_ID}
    logGetSeries: function(req_data, resolve, reject){
        if( !_.has(req_data, 'id') ) return reject('no id');
        if( !_.has(req_data, 'series') || !req_data.series.length ) return reject('no series');

        let check_point_time = helpers.now_ms();

        DataFlashLogModel.get(req_data.id.trim()).run()
            .then(function(log) {

                try {

                    fs.readFile('./../logs/' + log.bin_file + '.json', (err, file_content) => {
                        if (err) return reject('Failed to read file');

                        let log_msgs = JSON.parse(file_content);

                        let m_list = {};
                        let start_time = null;
                        let end_time = 0;

                        // Раскидать сообщения по группам
                        _.each(log_msgs, function(m, ind){
                            try {
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
                                        if( timeus > end_time ) end_time = timeus;
                                    }
                                }

                            }
                            catch (err ){
                                console.log('ERR', ind, err);
                            }
                        });

                        // проверить какие запрошены данные и сформировать ответные сообщения
                        let max_freq = 50;
                        const parse_group =function(group, options={}){ // {float_prec:3}
                            let data = {};
                            let float_prec = 3;

                            if( _.has(options, 'float_prec') ) float_prec = options.float_prec;

                            if( _.has(m_list, group) ){
                                let prev_point_time = -1;

                                _.each(m_list[group], (rec) => {
                                    // время записи
                                    let current_point_time = parseInt(rec['TimeUS'])-start_time;
                                    // ограничение частоты точек
                                    if( current_point_time-prev_point_time < 1000000/max_freq ) return;

                                    let point_time = Math.round(current_point_time/10000); // round to 0.01 sec

                                    _.mapKeys(rec, (value, field) => {
                                        if( 'TimeUS' !== field && 'mavpackettype' !== field ){
                                            if( !_.has(data, field) ) data[field] = [];

                                            if( parseFloat(value) ){
                                                if( parseFloat(value) === parseInt(value) ) data[field].push([point_time, parseInt(value)]);
                                                else data[field].push([point_time, parseFloat(parseFloat(value).toPrecision(float_prec))]);
                                            }
                                            else {
                                                data[field].push([point_time, 0]);
                                            }
                                        }
                                    });

                                    prev_point_time = current_point_time;

                                });
                            }

                            return data;

                        };

                        let response_series = {};
                        let parsed_groups = {};
                        _.each(req_data.series, ser => {
                            let [msg, field] = ser.split('.');
                            if( msg && field && _.has(m_list, msg) ){
                                if( !_.has(parsed_groups, msg) ) parsed_groups[msg] = parse_group(msg);
                                if( _.has(parsed_groups[msg], field) ){
                                    response_series[ser] = parsed_groups[msg][field];
                                }
                            }
                        });

                        //
                        // Отправка данных в браузер
                        resolve(response_series);

                        console.log('Series process time: ' + (helpers.now_ms()-check_point_time));
                    });

                }
                catch( err ){
                    console.log('ERR', err);
                    reject('Bin parse error');
                }

            })
            .catch(function(){
                reject('Log not found in DB');
            });
    },

    //
    // Удаление логов
    logRemove: function(data, resolve, reject){ console.log('Log remove act');
        if( !_.has(data, 'id') ){
            reject('no id');
            return;
        }

        DataFlashLogModel.get(data.id)
            .run().then( log => {
                let log_file = log.bin_file;

                console.log('Log remove act ' + log_file);
                log.delete()
                    .then( r => {
                        // Remove file
                        fs.unlink('./../logs/' + log_file, (err) => {
                            if( err )Logger.error('Failed to delete file ' + log_file, err);

                            console.log('BIN file log removed');
                        });
                        fs.unlink('./../logs/' + log_file + '.json', (err) => {
                            if( err )Logger.error('Failed to delete file ' + log_file + '.json', err);

                            console.log('JSON file log removed');
                        });

                        console.log('DB log removed');

                        resolve({id: data.id})
                    })
                    .catch( function(){
                        reject("Failed to delete from DB");
                    });
            })

            .catch( function(){
                reject("Log not found");
            });
    }

};

module.exports = RPC_routes;
