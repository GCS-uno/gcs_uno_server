const common_config = require('../configs/common_config')
     ,thinky = require('./../utils/thinky.js')
     ,validators = require('./../defs/form_validators'); // Form fields validators

const type = thinky.type
     ,r = thinky.r
     ,TABLE_NAME = "FlightLogs";


const FlightLog = thinky.createModel(TABLE_NAME, {
        id: type.string()
        ,name: type.string().min(2).max(50)
        ,date: type.date()
        ,location: type.string().min(2).max(100)
        ,bin_file: type.string().min(2).max(50)
        ,status: type.string()

        ,createdAt: type.date().default(r.now())
    }
    , {
        //enforce_missing: false
        //,enforce_extra: 'remove'
        //,enforce_type: 'strict'
    }
);


FlightLog.defineStatic("getList", function() {

    return r.table(TABLE_NAME).without('createdAt');

});

FlightLog.defineStatic("look", function() {

    return r.table(TABLE_NAME).changes().run();

});


FlightLog.define("getView", function() {
    delete this.createdAt;

    return this;
});


module.exports = FlightLog;


FlightLog.ensureIndex("createdAt");
