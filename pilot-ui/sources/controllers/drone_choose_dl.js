import DronesCollection from '../models/DronesCollection';

let event1 = null;

export default {

    ready: function (view) {

    }

    ,showWindow: function(view){

        return new Promise(function(resolve, reject){
            let drones = [];
            DronesCollection.data.each(function(row){
                if( 'online' === row.status ){
                    drones.push({id: row.id, value: row.name});
                }
            });

            if( !drones.length ) return reject('No drones online');

            view.getRoot().show();

            const select = view.getRoot().queryView({view:'richselect'});
            const download_btn = view.getRoot().queryView({localId:'btn:download'});

            // Загрузить в меню
            select.define('options', drones);
            select.refresh();

            if( event1 ) download_btn.detachEvent(event1);
            event1 = download_btn.attachEvent('onItemClick', function(){

                const drone_item = DronesCollection.getItem(select.getValue());

                if( drone_item ){
                    resolve(drone_item.Drone);
                }
                else {
                    reject('Drone seems to be removed');
                }

                view.getRoot().hide();

            });

        });
    }

}
