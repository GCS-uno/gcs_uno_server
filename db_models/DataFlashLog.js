const common_config = require('../configs/common_config')
     ,thinky = require('./../utils/thinky.js')
     ,validators = require('./../defs/form_validators'); // Form fields validators

const type = thinky.type
     ,r = thinky.r
     ,TABLE_NAME = "FlightLogs";


const DataFlashLog = thinky.createModel(TABLE_NAME, {
         id: type.string()
        ,createdAt: type.date().default(r.now())
        ,drone_id: type.string()
        ,gps_time: type.date()
        ,l_time: type.number()
        ,location_point: type.point()
        ,location: type.string().min(2).max(100)
        ,bin_file: type.string().min(2).max(50)
        ,ind_ts_sz: type.string()
    }
    , {
        //enforce_missing: false
        //,enforce_extra: 'remove'
        //,enforce_type: 'strict'
    }
);

DataFlashLog.defineStatic("r", function() {
    return r;
});

DataFlashLog.defineStatic("getList", function() {

    return r.table(TABLE_NAME).without('createdAt');

});

DataFlashLog.defineStatic("look", function() {

    return r.table(TABLE_NAME).changes().run();

});


DataFlashLog.define("getView", function() {
    delete this.createdAt;

    return this;
});


module.exports = DataFlashLog;


DataFlashLog.ensureIndex("createdAt");
DataFlashLog.ensureIndex("ind_ts_sz");
DataFlashLog.ensureIndex("drone_id");
