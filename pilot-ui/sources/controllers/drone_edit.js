import DronesCollection from '../models/DronesCollection';
import Message from '../plugins/Message';

export default {

    ready: function (view) {
        view.attachEvent('onShow', function(){
            //webix.message('Edit drone');
        });

        const _this = this;

        const win = view.$scope.getRoot();
        const form = view.$scope.$$('form:edit');
        const values = form.getValues();
        const save_button = view.$scope.$$('button:save');
        const remove_button = view.$scope.$$('button:remove');

        // Кнопка СОХРАНИТЬ в форме редактирования дрона
        save_button.attachEvent('onItemClick', function(){
            _this.save(view);
        });

        // Кнопка УДАЛИТЬ в форме редактирования дрона
        remove_button.attachEvent('onItemClick', function(){
            _this.remove(view);
        });

    }


    // Открыть окно с формой редактирования дрона
    ,open: function(window_scope, drone_id){

        const item = DronesCollection.getItem(drone_id);
        if( !item ) return;

        const win = window_scope.getRoot();
        const form = window_scope.$$('form:edit');
        const save_button = window_scope.$$('button:save');

        // Подготовить вид
        win.getHead().setHTML('');

        form.clear();
        form.setValues({id: drone_id, name: item.name});
        win.getHead().setHTML(item.name);

        form.disable();
        save_button.disable();

        win.show();

        // Покрутить форму наверх
        window_scope.$$('scrollForm').scrollTo(0,0);

        // загрузить данные в форму
        DronesCollection.Get(drone_id)
            .then( values => {
                if( "dji" === values.type ){
                    form.elements['udp_port'].hide();
                    form.elements['gcs_tcp_port'].hide();
                    form.queryView({localId: 'dl_log_on_disarm_row'}).hide();
                    form.queryView({localId: 'mavlink_section'}).hide();

                    form.elements['dji_model'].show();
                    form.elements['dji_fc_serial'].show();
                }
                else if( "mavlink" === values.type ){
                    form.elements['dji_model'].hide();
                    form.elements['dji_fc_serial'].hide();

                    form.elements['udp_port'].show();
                    form.elements['gcs_tcp_port'].show();
                    form.queryView({localId: 'dl_log_on_disarm_row'}).show();
                    form.queryView({localId: 'mavlink_section'}).show();
                }

                form.setValues(values);
                form.enable();
                save_button.enable();
            })
            .catch( err_msg => {
                Message.error(err_msg);
                window_scope.getRoot().hide();
            });

    }

    // Сохранить параметры дрона
    ,save: function(view){

        const form = view.$scope.$$('form:edit');
        const save_button = view.$scope.$$('button:save');
        const values = form.getValues();

        form.disable();
        save_button.disable();

        DronesCollection.Save(values)
            .then( data => {
                view.$scope.getRoot().hide();
            })
            .catch( err_msg => {
                Message.error(err_msg ? err_msg : 'Failed to save drone parameters');
                form.enable();
                save_button.enable();
            });

        /*
        webix.ajax().put('/api/drones/' + values.id, values, function(t,d){
            const resp = d.json();

            if( 'success' === resp.status ){
                DronesCollection.updateItem(values.id, values);
                view.$scope.getRoot().hide();
            }
            else {
                Message.error(resp.message ? resp.message : 'Failed to save drone parameters');
                form.enable();
                save_button.enable();
            }
        });
        */

    }

    // Drone remove
    ,remove: function(view){

        const win = view.$scope.getRoot();
        const form = view.$scope.$$('form:edit');
        const save_button = view.$scope.$$('button:save');
        const values = form.getValues();


        webix.confirm({
            ok: "Remove",
            cancel: "Cancel",
            text: "This drone will be completely removed",
            callback: function(result){ //setting callback
                if( !result ) return;

                form.disable();
                save_button.disable();

                DronesCollection.Remove({id: values.id})
                    .then( result => {
                        view.$scope.getRoot().hide();
                    })
                    .catch( err_msg => {
                        Message.error('Failed to remove drone');
                        form.enable();
                        save_button.enable();
                    });

           }
        });
    }

}

