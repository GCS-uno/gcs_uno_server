import MAVDrone from '../controllers/MAVDroneClient';
import DJIDrone from '../controllers/DJIDroneClient';
import Message from '../plugins/Message';

const DronesCollection = new webix.DataCollection({
    on: {
        //
        // After creating new
        'onAfterAdd': function(id){

            if( !this.Drones[id] ){
                let drone = this.getItem(id);
                if( drone ){
                    if( drone.type === "dji" ) this.Drones[id] = new DJIDrone(id);
                    else this.Drones[id] = new MAVDrone(id);
                }

            }

        }

        //
        // После загрузки списка с сервера
        ,'onAfterLoad': function(){
            // Добавим в коллекцию экземпляры класса Drone для каждого дрона
            if ( this.data.each ){
                this.data.each( drone => {

                    if( !this.Drones[drone.id] ){
                        if( drone.type === "dji" ) this.Drones[drone.id] = new DJIDrone(drone.id);
                        else this.Drones[drone.id] = new MAVDrone(drone.id);
                    }

                });
            }
        }
    }
});

//
// Сборка экземпляров MAVDroneClient с ключем по id
// let drone = DronesCollection.Drones[drone_id];
DronesCollection.Drones = {};

//
// Load list of drones
DronesCollection.List = function(){

    window.app.getService('io').rpc('dronesList', {}, true)
        .then( data => {
            this.clearAll();
            this.parse(data);
            return true;
        }).catch( Message.error );

};

//
// Returns values for form
DronesCollection.Get = function(drone_id){

    return new Promise(function(resolve, reject){
        // Get drone
        window.app.getService('io').rpc('droneGet', {id: drone_id})
            .then( resolve )
            .catch( reject );

    });
};

//
// Create new drone on server
DronesCollection.Create = function(values){

    const _this = this;

    return new Promise(function(resolve, reject){

        window.app.getService('io').rpc('droneCreate', values)
            .then( data => {
                _this.add(data);
                resolve({id: data.id});
            })
            .catch( reject );
    });

};

//
// Save modified drone to server
DronesCollection.Save = function(values){

    const _this = this;

    return new Promise(function(resolve, reject){

        window.app.getService('io').rpc('droneSave', values)
            .then( data => {
                // Обновить поля в таблице
                _this.updateItem(values.id, {
                    name: data.name
                    ,udp_port: data.udp_port
                    ,gcs_tcp_port: data.gcs_tcp_port
                });
                _this.Drones[values.id].updateParams(data);

                resolve(data);
            })
            .catch( reject );
    });

};

//
// Removes drone from DB
// resolves True, rejects Message
DronesCollection.Remove = function(values){

    const _this = this;

    return new Promise(function(resolve, reject){

        window.app.getService('io').rpc('droneRemove', values)
            .then( data => {
                _this.remove(data.id);
                if( _this.Drones[data.id] ){
                    _this.Drones[data.id].remove();
                    delete _this.Drones[data.id];
                }

                resolve(true);
            })
            .catch( reject );
    });

};



export default DronesCollection;
