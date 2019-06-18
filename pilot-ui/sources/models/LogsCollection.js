import Message from '../plugins/Message';

const LogsCollection = new webix.DataCollection({
    on: {
        //
        // After creating new
        'onAfterAdd': function(id){}

        //
        // После загрузки списка с сервера
        ,'onAfterLoad': function(){}

    }
});

//
// Load list of drones
LogsCollection.List = function(){

    window.app.getService('io').rpc('logsList', {}, true)
        .then( data => {
            this.clearAll();
            this.parse(data);
            this.sort("createdAt", "desc");
            return true;
        }).catch( Message.error );

};

//
// Returns values for form
LogsCollection.Get = function(log_id){

    return new Promise(function(resolve, reject){
        // Get drone
        window.app.getService('io').rpc('logGet', {id: log_id})
            .then( resolve )
            .catch( reject );

    });
};

//
// Removes log from DB
// resolves True, rejects Message
LogsCollection.Remove = function(log_id){

    const _this = this;

    return new Promise(function(resolve, reject){

        window.app.getService('io').rpc('logRemove', {id:log_id})
            .then( data => {
                if( _this.getItem(data.id)) _this.remove(data.id);
                resolve(true);
            })
            .catch( reject );
    });

};


export default LogsCollection;
