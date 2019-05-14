const thinky = require('./../utils/thinky.js');
const type = thinky.type;
const r = thinky.r;



const FlightPlan = thinky.createModel("FlightPlans", {
    id: type.string()

    ,name: type.string().min(2).max(50)

    ,createdAt: type.date().default(r.now())

    ,location: type.string().max(101)
    ,map: {
        center: type.point()
        ,zoom: type.number().min(1).max(30)
    }
    ,distance: type.number()
    ,travel_time: type.number()
    ,home: type.point()
    ,rtl_end: type.boolean().default(true)

});

module.exports = FlightPlan;

const FlightPlanItem = require('./FlightPlanItem');
FlightPlan.hasMany(FlightPlanItem, "items", "id", "flight_plan_id");


FlightPlan.defineStatic("getList", function() {

    return this.default({}); //.without('f1','f2');

});

FlightPlan.defineStatic("r", function() {
    return r;
});


const items_list = function(items){
    let list = [];

    if( items && items.length ) {
        for (let i = 0, k = items.length; i < k; i++) {
            //console.log(items[i].isSaved());

            //let pos = null;
            //if( items[i].position ) pos = {lat: items[i].position.coordinates[1], lng: items[i].position.coordinates[0]};

            list.push({
                id: items[i].id
                ,seq: items[i].seq
                ,command: items[i].command
                ,frame: items[i].frame
                ,param1: items[i].param1
                ,param2: items[i].param2
                ,param3: items[i].param3
                ,param4: items[i].param4
                ,param5: items[i].param5
                ,param6: items[i].param6
                ,param7: items[i].param7


                //,position: pos
                //,alt: items[i].alt
                //,alt_rel: items[i].alt_rel
                //,hold: items[i].hold_time
                //,speed: items[i].speed
            });
        }
    }

    return list;
};


FlightPlan.define("getView", function() {
    // delete this.field;

    if( this.map ){
        this.map = {
            center: {lat: this.map.center.coordinates[1], lng: this.map.center.coordinates[0]}
            ,zoom: this.map.zoom
        };
    }

    if( this.home ){
        this.home = {lat: this.home.coordinates[1], lng: this.home.coordinates[0]}
    }

    this.items = items_list(this.items);

    return this;

});


// FlightPlan.ensureIndex('field');

