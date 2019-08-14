import FlightPlan from '../controllers/FlightPlan';
import Message from "../plugins/Message";


const FlightPlansCollection = new webix.DataCollection({
    on: {
        'onAfterAdd': function(id){
            if( !this.FP[id] ) this.FP[id] = new FlightPlan(id);
        }

        ,'onAfterLoad': function(){
            const _this = this;
            if (this.data.each){
                this.data.each(function(fp){
                    if( !_this.FP[fp.id] ) _this.FP[fp.id] = new FlightPlan(fp.id);
                });
            }
        }
    }

});

//
// Экземпляры класса FlightPlan для каждого полетного плана
FlightPlansCollection.FP = {};

//
// Загрузка списка заданий
FlightPlansCollection.List = function(){

    window.app.getService('io').rpc('fpList', {}, true)
        .then( data => {
            this.clearAll();
            this.parse(data);
            return true;
        }).catch( Message.error );

};

//
// Загрузка данных одного задания по его id
FlightPlansCollection.Get = function(fp_id){

    return new Promise(function(resolve, reject){
        // Get drone
        window.app.getService('io').rpc('fpGet', {id: fp_id})
            .then( resolve )
            .catch( reject );

    });
};

//
// Создание нового полетного задания
FlightPlansCollection.Create = function(){
    const _this = this;

    return new Promise(function(resolve, reject){

        window.app.getService('io').rpc('fpCreate', {})
            .then( data => {
                _this.add(data);
                resolve(data.id);
            })
            .catch( reject );
    });
};

//
// Сохранение полетного плана
FlightPlansCollection.Save = function(values){

    const _this = this;

    return new Promise(function(resolve, reject){

        window.app.getService('io').rpc('fpSave', values)
            .then( data => {
                // Обновить поля в таблице
                _this.updateItem(values.id, values);

                resolve(data);

            })
            .catch( reject );
    });

};

//
// Удаление адания из БД
FlightPlansCollection.Remove = function(values){

    const _this = this;

    return new Promise(function(resolve, reject){

        window.app.getService('io').rpc('fpRemove', values)
            .then( data => {
                // Удаление из таблицы
                _this.remove(data.id);
                // Возврат в экземпляр, где удалится ссылка на него
                resolve(true);
            })
            .catch( reject );
    });

};





export default FlightPlansCollection;
