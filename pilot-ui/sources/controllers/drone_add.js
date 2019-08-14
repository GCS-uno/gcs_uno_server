//
// front end: controllers/drone_add
//
import DronesCollection from '../models/DronesCollection';
import Message from '../plugins/Message';

export default {

    ready: function (view) {

        const form = view.$scope.$$('form:add')
             ,save_btn = view.$scope.$$('button:save');

        // Очистить название при каждом открытии окна
        view.attachEvent('onShow', function(){
            form.elements['name'].setValue('');
            form.enable();
            save_btn.enable();
        });

        // Кнопка Сохранить новый БПЛА
        save_btn.attachEvent('onItemClick', this.save_new_drone);

    }

    //
    // Save new drone when button pressed
    ,save_new_drone: function(){
        // this == view
        const _this = this;

        const form = _this.$scope.$$('form:add');
        const save_btn = _this.$scope.$$('button:save');
        const values = form.getValues();

        form.markInvalid('name', false);

        if( !form.validate() ) return;

        form.disable();
        save_btn.disable();

        DronesCollection.Create(values)
            // success
            .then( resp => {
                _this.$scope.getRoot().hide();
                _this.$scope._parent.edit_window.showWindow(resp.id);
            })
            .catch( err_msg => {
                form.enable();
                save_btn.enable();
                Message.error(err_msg);
            });

    }

}
