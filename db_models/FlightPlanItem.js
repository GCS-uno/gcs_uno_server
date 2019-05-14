const thinky = require('./../utils/thinky.js');
const type = thinky.type;
const r = thinky.r;


/*
    Последовательные команды полетного плана
 */
const FlightPlanItem = thinky.createModel("FlightPlanItems", {
    id: type.string()
    ,flight_plan_id: type.string().required()
    ,type: type.string().enum('command', 'survey').default('command')

    ,seq: type.number().min(0).integer().required()
    ,position: type.point().allowNull(true)

    ,command: type.number().min(0).integer()
    ,frame: type.number().min(0).integer()
    ,param1: type.number().allowNull(true)
    ,param2: type.number().allowNull(true)
    ,param3: type.number().allowNull(true)
    ,param4: type.number().allowNull(true)
    ,param5: type.number().allowNull(true)
    ,param6: type.number().allowNull(true)
    ,param7: type.number().allowNull(true)

    // Дополнительные данные в элементе плана
    ,meta: type.object().allowNull(true)

});

module.exports = FlightPlanItem;

const FlightPlan = require('./FlightPlan');
FlightPlanItem.belongsTo(FlightPlan, "flight_plan", "flight_plan_id", "id");


FlightPlanItem.ensureIndex('seq', {multi: true});


FlightPlanItem.defineStatic("r", function() {
    return r;
});


