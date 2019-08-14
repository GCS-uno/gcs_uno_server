import FlightPlansCollection from '../models/FlightPlansCollection';
import Message from '../plugins/Message';

const geocoder = new google.maps.Geocoder;


// Параметры по умолчанию  для вновь создаваемых команд
const MAV_COMMANDS = {
    // waypoint
    16: {
        command: 16 // NAV_WAYPOINT
        ,frame: 3 // FRAME
        ,param1: 0 // hold
        ,param2: 5 // acceptance radius
        ,param3: 0 // 0 to pass through the WP, if > 0 radius in meters to pass by WP
        ,param4: NaN // Desired yaw angle at waypoint
        //,param5: null
        //,param6: null
        ,param7: 30
    }

    // Loiter unlimited
    ,17: {
        command: 17
        ,frame: 3
        ,param1: null
        ,param2: null
        ,param3: 5
        ,param4: 0
        //,param5: null
        //,param6: null
        ,param7: 30
    }

    // Loiter turns
    ,18: {
        command: 18
        ,frame: 3
        ,param1: 3
        ,param2: null
        ,param3: 5
        ,param4: 0
        //,param5: null
        //,param6: null
        ,param7: 30
    }

    // loiter time
    ,19: {
        command: 19
        ,frame: 3
        ,param1: 10
        ,param2: null
        ,param3: 5
        ,param4: 0
        //,param5: 0
        //,param6: 0
        ,param7: 30
    }

    // land
    ,21: {
        command: 21
        ,frame: 0
        ,param1: 0
        ,param2: 0
        ,param3: null
        ,param4: null
        //,param5: 0
        //,param6: 0
        ,param7: 0
    }

    // takeoff
    ,22: {
        command: 22
        ,frame: 3
        ,param1: 0 // pitch
        ,param2: 0
        ,param3: 0
        ,param4: 0
        ,param5: 0
        ,param6: 0
        ,param7: 30 // alt
    }

    // loiter alt
    ,31: {
        command: 31
        ,frame: 3
        ,param1: 0
        ,param2: 5
        ,param3: null
        ,param4: 0
        //,param5: 0
        //,param6: 0
        ,param7: 30
    }

    // speed
    ,178: {
        command: 178
        ,frame: 0
        ,param1: 1 // Speed type (0=Airspeed, 1=Ground Speed)
        ,param2: -1 // Speed (m/s, -1 indicates no change)
        ,param3: -1 // Throttle ( Percent, -1 indicates no change)
        ,param4: 0 // absolute or relative [0,1]
        ,param5: 0
        ,param6: 0
        ,param7: 0
    }

    // set relay
    ,181: {
        command: 181
        ,frame: 0
        ,param1: 1
        ,param2: 0
        //,param3: 0
        //,param4: 0
        //,param5: 0
        //,param6: 0
        //,param7: 0
    }

    // repeat relay
    ,182: {
        command: 182
        ,frame: 0
        ,param1: 1
        ,param2: 3
        ,param3: 20
        //,param4: 0
        //,param5: 0
        //,param6: 0
        //,param7: 0
    }

    // set servo
    ,183: {
        command: 183
        ,frame: 0
        ,param1: 5
        ,param2: 1000
        //,param3: 0
        //,param4: 0
        //,param5: 0
        //,param6: 0
        //,param7: 0
    }

    // repeat servo
    ,184: {
        command: 184
        ,frame: 0
        ,param1: 5
        ,param2: 1000
        ,param3: 5
        ,param4: 20
        //,param5: 0
        //,param6: 0
        //,param7: 0
    }

    // change alt
    ,186: {
        command: 186
        ,frame: 0
        ,param1: 0
        ,param2: 0
        ,param3: 0
        ,param4: 0
        ,param5: 0
        ,param6: 0
        ,param7: 0
    }

    // camera
    ,200: {
        command: 200
        ,frame: 0
        ,param1: 0
        ,param2: 0
        ,param3: 0
        ,param4: 0
        ,param5: 0
        ,param6: 0
        ,param7: 0
    }

};


const marker_icon_normal = {
    path: google.maps.SymbolPath.CIRCLE
    ,scale: 11
    ,fillColor: '#ffbd4d'
    ,fillOpacity: 1.0
    ,strokeColor: '#000000'
    ,strokeWeight: 2
    ,zIndex: 2000
};

const marker_icon_home = {
    path: google.maps.SymbolPath.CIRCLE
    ,scale: 11
    ,fillColor: '#000000'
    ,fillOpacity: 1.0
    ,strokeColor: '#ffbd4d'
    ,strokeWeight: 2
    ,zIndex: 2000
};

const marker_icon_edit = {
    path: google.maps.SymbolPath.CIRCLE
    ,scale: 11
    ,fillColor: '#4aff0e'
    ,fillOpacity: 1.0
    ,strokeColor: '#000000'
    ,strokeWeight: 3
    ,zIndex: 2000
};



export default class FlightPlan {


    // Конструктор задания
    constructor(id) {
        if( !id ) return;

        this.id = id;
        this.data = new webix.DataRecord();

        this.view = null;
        this.view_enabled = false;
        this.map = null;
        this.alt_chart = null;
        this.mission_form = null;

        // Таблица с элементами полетного плана
        this.mission_items_table = null;

        // Маркер стартовой позиции
        this.home_marker = null;
        this.end_marker_item_id = null;

        // Текущая активная точка
        this.active_item_id = null;

        // Линия маршрута на карте
        this.map_route_path = new google.maps.Polyline({
            strokeColor: '#ffbd4d'
            ,strokeOpacity: 0.8
            ,strokeWeight: 2
            ,geodesic: true
            ,zIndex: 1
        });
        // Линия возврата на точку старта
        this.rtl_path = new google.maps.Polyline({
            path: [],
            strokeOpacity: 0,
            geodesic: true,
            icons: [{
                icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 1.0,
                    strokeColor: '#120dff',
                    scale: 3
                },
                offset: '0',
                repeat: '20px'
            }]
        });

        // Коллекция элементов плана
        this.mission_items_collection = new webix.DataCollection();


        /*
        this.map_route_path.addListener('click', () => {
            webix.message('poly click');
        });

        this.map_route_path.addListener('dragstart', () => {
            webix.message('poly dragstart');
        });

        this.map_route_path.addListener('dragend', () => {
            webix.message('poly dragend');
        });


        this.map_route_path.getPath().addListener('insert_at', (i) => {
            //webix.message('path insert_at ' + i);
        });

        this.map_route_path.getPath().addListener('remove_at', (i) => {
            //webix.message('path remove_at ' + i);
        });

        this.map_route_path.getPath().addListener('set_at', (i) => {
            //console.log('path set_at ' + i);
        });

        */

    }


    // Открываем редактор полетного задания
    openEditor(view){

        const _this = this;

        _this.view_enabled = true;
        _this.view = view;

        _this.view.showProgress();

        // Определим элементы интерфейса для дальнейшей работы всех функций
        _this.map = view.$scope.$$('mission:map').getMap();
        _this.alt_chart = view.$scope.$$('chart:alt');
        _this.mission_form = view.$scope.$$('mission:form');
        _this.mission_items_table = view.$scope.$$('table:points');
        const upload_plan = webix.$$('FPTE:btn:upload');
        const upload_progress = webix.$$('FPTE:tpl:progress');
        const remove_btn = webix.$$('FPTE:btn:trash');

        // Очистим коллекцию с точками
        _this.mission_items_collection.clearAll();

        // Очистим все старые события на элементах интерфейса
        _this.mission_items_table.detachEvent('onItemClick');
        _this.mission_form.clear();

        // Очистим линию маршрута
        _this.map_route_path.getPath().clear();

        // Подвязка таблицы к коллекции команд
        _this.mission_items_table.sync(_this.mission_items_collection);

        // При клике на строку в таблице у соотвествующего маркера включается режим редактирования
        _this.mission_items_table.attachEvent('onItemClick', id => _this.editWaypoint(id) );

        //
        // Включить нужную форму для редактирования команды
        const set_item_view = function(subview, item){
            let item_view = subview.queryView({localId: 'item_view_' + item.command});

            if( !item_view ){
                item_view = subview.queryView({localId: 'item_view_custom'});
            }

            const COMMAND_GROUPS = {
                waypoint: [16, 82]
                ,loiter: [17, 18, 19, 31]
                ,land: [21, 85]
            };

            let command_group = 0;

            // Включить вид формы
            item_view.show();

            // Форма внутри вида
            const item_form = item_view.queryView({view: 'form'});

            if( COMMAND_GROUPS.waypoint.indexOf(parseInt(item.command)) !== -1 ) command_group = 'waypoint';
            else if( COMMAND_GROUPS.loiter.indexOf(parseInt(item.command)) !== -1 ) command_group = 'loiter';
            else if( COMMAND_GROUPS.land.indexOf(parseInt(item.command)) !== -1 ) command_group = 'land';


            //
            //  Навесить события на формы редактирования команд
            //

            // HOME
            if( 'home' === item.id ){

                // Установить начальные значения
                item_form.setValues({rtl_end: _this.data.getValues().rtl_end, command: 'home'}, true);

                // Возврат на точку старта по окончанию
                item_form.elements['rtl_end'].attachEvent('onChange', function(new_value, old_value){
                    // Сохранение нового значения
                    _this.save({rtl_end: new_value})
                        .then(function(d){
                            _this.data.setValues({rtl_end: new_value}, true);

                            _this.updateRTLPath();
                            // Пересчитываем общую длину маршрута
                            _this.calcRouteLength();
                        })
                        .catch(function(){
                            item_form.elements['rtl_end'].blockEvent();
                            item_form.elements['rtl_end'].setValue(old_value);
                            Message.error('Failed to save RTL option');
                        });

                });

            }

            // Прочие команды
            else {

                // Загрузить данные в форму редактирования точки
                item_form.setValues({
                     id: _this.id
                    ,seq: item.seq
                    ,command: item.command
                    ,command_group: command_group
                    ,frame: item.frame
                    ,param1: item.param1
                    ,param2: item.param2
                    ,param3: item.param3
                    ,param4: item.param4
                    ,param5: item.param5
                    ,param6: item.param6
                    ,param7: item.param7
                });

                // А потом навесить обработчики событий

                // При изменении группы команды, меняем вид
                let command_group_field = item_form.elements['command_group'];// name: 'command_group'

                if( command_group_field && !command_group_field.hasEvent('onChange') ){
                    command_group_field.attachEvent('onChange', function(new_value, old_value){
                        // Переключить вид на другую команду в зависимости (по умолчанию в указанной группе)

                        let change_command_data = webix.copy(MAV_COMMANDS[COMMAND_GROUPS[new_value][0]]);

                        change_command_data.seq = item.seq;

                        _this.updateFPItem(change_command_data);

                        // Утановить новый вид
                        set_item_view(subview, change_command_data);

                    });
                }

                // При изменении команды меняем вид
                if( item_form.elements['command'] && !item_form.elements['command'].hasEvent('onChange') ){
                    item_form.elements['command'].attachEvent('onChange', function(new_value, old_value){
                        // Переключить вид на другую команду в зависимости (по умолчанию в указанной группе)

                        let change_command_data = webix.copy(MAV_COMMANDS[new_value]);
                        change_command_data.seq = item.seq;

                        _this.updateFPItem(change_command_data);

                        // Утановить новый вид
                        set_item_view(subview, change_command_data);

                    });
                }

                // При изменении параметров отправить их на сохранение
                if( item_form.elements['frame'] && !item_form.elements['frame'].hasEvent('onChange') ) item_form.elements['frame'].attachEvent('onChange', function(new_value, old_value){
                    _this.updateFPItem({seq: item.seq, frame: new_value});
                });
                if( item_form.elements['param1'] && !item_form.elements['param1'].hasEvent('onChange') ) item_form.elements['param1'].attachEvent('onChange', function(new_value, old_value){
                    console.log(item);
                    _this.updateFPItem({seq: item.seq, param1: new_value});
                });
                if( item_form.elements['param2'] && !item_form.elements['param2'].hasEvent('onChange') ) item_form.elements['param2'].attachEvent('onChange', function(new_value, old_value){
                    _this.updateFPItem({seq: item.seq, param2: new_value});
                });
                if( item_form.elements['param3'] && !item_form.elements['param3'].hasEvent('onChange') ) item_form.elements['param3'].attachEvent('onChange', function(new_value, old_value){
                    _this.updateFPItem({seq: item.seq, param3: new_value});
                });
                if( item_form.elements['param4'] && !item_form.elements['param4'].hasEvent('onChange') ) item_form.elements['param4'].attachEvent('onChange', function(new_value, old_value){
                    _this.updateFPItem({seq: item.seq, param4: new_value});
                });
                if( item_form.elements['param5'] && !item_form.elements['param5'].hasEvent('onChange') ) item_form.elements['param5'].attachEvent('onChange', function(new_value, old_value){
                    _this.updateFPItem({seq: item.seq, param5: new_value});
                });
                if( item_form.elements['param6'] && !item_form.elements['param6'].hasEvent('onChange') ) item_form.elements['param6'].attachEvent('onChange', function(new_value, old_value){
                    _this.updateFPItem({seq: item.seq, param6: new_value});
                });
                if( item_form.elements['param7'] && !item_form.elements['param7'].hasEvent('onChange') ) item_form.elements['param7'].attachEvent('onChange', function(new_value, old_value){
                    _this.updateFPItem({seq: item.seq, param7: new_value});
                });

            }

        };

        // При открытии и создании суб-вида формы редактирования точки, загружаем в нее нужные данные
        // и инициализируем обработчики событий
        _this.mission_items_table.attachEvent("onSubViewCreate", function(subview, item){

            // Кнопка Добавить элемент
            const add_item = subview.queryView({localId: 'btn:add_after'});

            // Кнопка Удалить элемент
            const remove_btn = subview.queryView({localId: 'btn:remove_item'});

            // Контроллер меню добавления нового элемента
            add_item.attachEvent('onItemClick', function(id, e){
                //console.log(e);

                //
                // Открываем меню и создаем контроллеры
                _this.view.$scope.item_add_popup.show({x:e.x, y:e.y});
                _this.view.$scope.item_add_popup.queryView({view:'menu'}).detachEvent('onItemClick');
                _this.view.$scope.item_add_popup.queryView({view:'menu'}).attachEvent('onItemClick', function(id){


                    let new_item = webix.copy(MAV_COMMANDS[id]);
                    new_item.id = webix.uid();
                    new_item.seq = item.seq+1;

                    //console.log(new_item);

                    // Добавить новый элемент полетного плана в выбранную позицию
                    _this.addFPItem(new_item);

                    // Потом сохранить его на сервере
                    _this.createFPItem(new_item);

                    // Скрыть меню
                    _this.view.$scope.item_add_popup.hide();

                });

            });

            // Удаление элемента
            remove_btn.detachEvent('onItemClick');
            remove_btn.attachEvent('onItemClick', function(){
                webix.confirm({
                    ok: "Remove",
                    cancel: "Cancel",
                    text: "Remove this item?",
                    callback: function(result){ //setting callback
                        if( !result ) return;

                        _this.removeFPItem(item.id);

                    }
                });
            });

            // Скрыть кнопку Удалить в первом элементе Home
            if( 'home' === item.id ) {
                remove_btn.hide();
            }

            // Форма редактирования параметров команды
            set_item_view(subview, item);



            /*
            // Ссылка на мультивид внутри формы
            const mv = subview.queryView({view: 'multiview'}).getChildViews();

            // навесить события на формы редактирования

            // Точка Старт
            if( 'home' === item.id ){
                // Данные формы
                subview.setValues({
                    takeoff: _this.data.takeoff_alt ? 1 : 0
                    ,takeoff_alt: _this.data.takeoff_alt

                    ,set_init_speed: _this.data.init_speed > 0 ? 1 : 0
                    ,init_speed: _this.data.init_speed
                    ,rtl_end: _this.data.rtl_end
                    ,item_id: item.id
                });

                // Если указана высота взлета, то показываем поле
                if( _this.data.takeoff_alt > 0 ){
                    subview.elements['takeoff_alt'].show();
                }
                else {
                    subview.elements['takeoff_alt'].hide();
                }

                if( _this.data.init_speed > 0 ){
                    subview.elements['init_speed'].show();
                }
                else {
                    subview.elements['init_speed'].hide();
                }

                subview.elements['takeoff'].attachEvent('onChange', function(value){
                    if( 1 === value ){
                        subview.elements['takeoff_alt'].setValue(10);
                        subview.elements['takeoff_alt'].show();
                    }
                    else {
                        subview.elements['takeoff_alt'].setValue(0);
                        subview.elements['takeoff_alt'].hide();
                    }
                });

                // Высота взлета
                subview.elements['takeoff_alt'].attachEvent('onChange', function(value){
                    _this.save({takeoff_alt: value});
                    _this.mission_items_collection.updateItem('home', {alt: value});
                    _this.data.takeoff_alt = value;
                });


                subview.elements['set_init_speed'].attachEvent('onChange', function(value){
                    if( 1 === value ){
                        subview.elements['init_speed'].setValue(10);
                        subview.elements['init_speed'].show();
                    }
                    else {
                        subview.elements['init_speed'].setValue(0);
                        subview.elements['init_speed'].hide();
                    }
                });

                subview.elements['init_speed'].attachEvent('onChange', function(value){
                    _this.save({init_speed: value});
                    _this.mission_items_collection.updateItem('home', {init_speed: value});
                    _this.data.init_speed = value;
                });




                // Включаем форму для точки Старт
                mv[1].show();

            }

            // Точка маршрута
            else {
                // Данные формы
                subview.setValues({
                    alt: item.alt
                    ,alt_rel: item.alt_rel
                    ,speed: item.spd
                    ,hold: item.hold
                    ,item_id: item.id
                });


                // Высота
                subview.elements['alt'].attachEvent('onChange', function(value){
                    _this.updateFPItem(item.seq, {alt: value});
                    _this.mission_items_collection.updateItem(item.id, {alt: value});
                });

                // высота относительно
                subview.elements['alt_rel'].attachEvent('onChange', function(value){
                    _this.updateFPItem(item.seq, {alt_rel: value});
                });

                // Скорость
                subview.elements['speed'].attachEvent('onChange', function(value){
                    _this.updateFPItem(item.seq, {speed: value});
                    _this.mission_items_collection.updateItem(item.id, {spd: value});
                });

                // время зависания
                subview.elements['hold'].attachEvent('onChange', function(value){
                    _this.updateFPItem(item.seq, {hold: value});
                });

                // кнопка удаления точки
                subview.queryView({localId: 'button:remove_point'}).attachEvent('onItemClick', function(){


                });

                // Переключаем на форму точки маршрута
                mv[2].show();
            }

            */

        });


        // Синхронизация графика высоты с коллекцией точек
        _this.alt_chart.data.sync( _this.mission_items_collection, function(){
            this.filter(function(row) {
                //if( row.param5 && row.param6 && row.param7 ) console.log(row);
                return row.id === 'home' || row.command === 21 || row.param5 && row.param6 && row.param7 !== null;
            });
        } );

        // Клик на маркере в графике
        _this.alt_chart.attachEvent('onItemClick', function(id){
            _this.editWaypoint(id);
        });

        // Загрузка полетного плана на борт
        upload_plan.attachEvent('onItemClick', function(){
            view.$scope.drone_choose.showWindow().then(function(drone){

                upload_progress.show();
                upload_plan.disable();
                remove_btn.disable();
                view.showProgress();

                drone.uploadFlightPlan(_this.id, upload_progress).then(function(){
                    upload_progress.hide();
                    upload_progress.setValues({progress: 0});
                    upload_plan.enable();
                    remove_btn.enable();
                    view.hideProgress();
                    Message.info('Flight plan uploaded');
                }).catch(function(err){
                    upload_progress.hide();
                    upload_progress.setValues({progress: 0});
                    upload_plan.enable();
                    remove_btn.enable();
                    view.hideProgress();
                    Message.error('Upload failed: ' + err);
                });

            }).catch( Message.error );
        });

        // Кнопка удаления плана
        remove_btn.attachEvent('onItemClick', () => {
            webix.confirm({
                ok: "Remove",
                cancel: "Cancel",
                text: "This flight plan will be COMPLETELY REMOVED!",
                callback: function(result){ //setting callback
                    if( result ) _this.remove();
                }
            });
        });

        // Определение границ полилинии
        const getBoundsForPoly = function(poly) {
            let bounds = new google.maps.LatLngBounds;
            poly.getPath().forEach(function(latLng) {
                bounds.extend(latLng);
            });
            return bounds;
        };

        // Загрузить данные полетного плана
        FlightPlansCollection.Get(_this.id)
            .then(function(fp_data){
                // Сохранить загруженные данные в общую переменную
                _this.data.setValues(fp_data, true);

                // Установить название полетного плана в заголовок приложения
                _this.setAppTitle();

                // Установим точку старта, если она есть
                if( fp_data.home ){

                    // Сама точка старта
                    let home_item = _this.addFPItem({
                         seq: 0
                        ,command: 'home'
                        ,id: 'home'

                        ,param1: 0
                        ,param2: 0
                        ,param3: 0
                        ,param4: 0
                        ,param5: fp_data.home.lat
                        ,param6: fp_data.home.lng
                        ,param7: 0
                    });

                    _this.home_marker = home_item.marker;

                    // Если есть элементы плана, то добавим их
                    if( fp_data.items && fp_data.items.length ){
                        for( let i = 0, k = fp_data.items.length; i < k; i++ ){
                            _this.addFPItem(fp_data.items[i]);
                        }

                        // Пересчитываем общую длину маршрута
                        _this.calcRouteLength();

                    }

                    // Обновить маршрут возврата
                    _this.updateRTLPath();

                    //
                    // установить начальное положение карты
                    if( _this.view_enabled && _this.map ){

                        // границы карты по границе маршрута
                        if( fp_data.items && fp_data.items.length ){
                            _this.map.fitBounds(getBoundsForPoly(_this.map_route_path));
                        }
                        // центр карты и зум на точку старта
                        else {
                            _this.map.setCenter(fp_data.home);
                            _this.map.setZoom(14);
                        }

                    }


                }

                // Если точка старта еще не сохранена, то возможно есть центр карты
                else if( fp_data.map ){
                    // установить центр карты и зум
                    _this.map.setCenter(fp_data.map.center);
                    _this.map.setZoom(fp_data.map.zoom);
                }

                // Если нет ни того ни другого, то открыть окно для ввода и поиска адреса
                else {
                    const address_popup = _this.view.$scope.address_popup;
                    const text_search = address_popup.queryView({localId: 'text:search_loc'});
                    const button_search = _this.view.$scope.address_popup.queryView({localId: 'button:search_loc'});

                    // Открыть окно
                    address_popup.show();
                    address_popup.enable();

                    // Очистить текстовое поле
                    text_search.setValue('');

                    // Убрать старые и навесить новые обработчики
                    button_search.detachEvent('onItemClick');
                    text_search.detachEvent('onChange');
                    button_search.attachEvent('onItemClick', function(){
                        let value = text_search.getValue();
                        if( value.length > 2 ){
                            _this.searchLocation(value);
                        }
                    });
                    text_search.attachEvent('onChange', function(){
                        let value = text_search.getValue();
                        if( value.length > 2 ){
                            _this.searchLocation(value);
                        }
                    });

                }


                // Заполнение формы данными
                _this.mission_form.setValues(_this.data.getValues());

                // Обработчики элементов формы для сохранения
                _this.mission_form.elements['name'].attachEvent("onChange", function(new_name){
                    if( !new_name.trim().length ){
                        _this.mission_form.elements['name'].setValue(_this.data.getValues().name);
                        return;
                    }
                    _this.save({name: new_name})
                        .then(function(){
                            _this.data.setValues({name: new_name}, true);
                            _this.setAppTitle();
                        })
                        .catch(function(e){
                            //Message.error('Failed to save name');
                        });
                });
                _this.mission_form.elements['location'].attachEvent("onChange", function(new_loc){
                    _this.save({location: new_loc})
                        .then(function(){
                            //FlightPlansCollection.updateItem(_this.id, {location: new_loc});
                        })
                        // А иначе сообщаем, об ошибке
                        .catch(function(){
                            Message.error('Failed to save location');
                        });
                });

                // Включение карты для всех элементов
                _this.setMap();

                // Отключение прогресс-бара
                _this.view.hideProgress();

            })
            .catch(function(err){
                Message.error('Failed to load flight plan data');
                _this.returnToList();
            });

    }


    // Установка названия задания в заголовке приложения
    setAppTitle(){
        const _this = this;

        if( _this.view && _this.view_enabled ) _this.view.$scope.app.getService('topTitle').update([{text: 'Flight plans', link: '/app/flight_plans_list'}, {text: _this.data.getValues().name}]);
        //webix.$$('app_head_title').setValues([{text: 'Flight plans', link: '/app/flight_plans_list'}, {text: _this.data.getValues().name}]);
    }


    // Сохранение данных на сервер
    save(values){

        values.id = this.id;

        return FlightPlansCollection.Save(values);

    }


    // Удалить задание
    remove(){
        const _this = this;

        FlightPlansCollection.Remove({id: _this.id})
            .then(function(){
                _this.returnToList();
                if( FlightPlansCollection.FP[_this.id] ) delete FlightPlansCollection.FP[_this.id];
            })
            .catch(function(){
                Message.error('Failed to remove flight plan');
            });

    }


    // Вернуться в список заданий
    returnToList(){
        if( this.view ) this.view.$scope.show('flight_plans_list');
    }


    // Поиск местоположения по адресу и установка карты
    searchLocation(text){
        const _this = this;

        if( !geocoder ) return;

        _this.view.$scope.address_popup.disable();

        // Поиск местоположения по введенной строке (адрес или координаты)
        geocoder.geocode({'address': text}, function(results, status) {
            // Если место найдено
            if ( status === 'OK' && _this.map ) {
                // Передвигаем карту и ставим зум
                _this.map.setCenter(results[0].geometry.location);
                _this.map.setZoom(15);

                // И запишем в форму
                _this.mission_form.setValues({location: results[0].formatted_address}, true);

                // Закроем окно для ввода адреса
                _this.view.$scope.address_popup.hide();

                // сохранить центр карты
                _this.save({map_center: results[0].geometry.location, map_zoom: 15, location: results[0].formatted_address});

            }

            // А если не найдено, то покажем сообщение
            else {
                webix.alert('Not found. Try to enter human-friendly location or machine-friendly longitude and latitude');
                _this.view.$scope.address_popup.enable();
            }

        });

    }


    // Инициализация карты и подвеска элементов карты задания
    setMap(){

        const _this= this;

        // Линия маршрута
        _this.map_route_path.setMap(_this.map);

        // Включение маркера старта
        if( _this.home_marker ) _this.home_marker.setMap(_this.map);

        // Включение точек на маршруте
        _this.mission_items_collection.data.each(item => {
            if( item.marker ) item.marker.setMap(_this.map);
        });

        // Включение обратного маршрута, если он включен
        if( _this.data.getValues().rtl_end ) _this.rtl_path.setMap(_this.map);

        // Обработка кликов на карте
        _this.map.addListener('click', event => {
            _this.mapClick(event);
        });

    }


    // Обработка кликов на карте
    mapClick(event){
        const _this = this;

        // Если в списке есть элементы и никакой из них не активирован, то точка не добавляется
        if( _this.mission_items_collection.count() && !_this.active_item_id ){
            return;
        }

        // Если активирован элемент (команда) у которого нет маркера, то точка тоже не добавляется
        //if( _this.active_item_id && _this.mission_items_collection.getItem(_this.active_item_id) && !_this.mission_items_collection.getItem(_this.active_item_id).marker ) return;

        // Точка добавляется как HOME в пустой список или после активного элемента

        // Определить каким порядком пойдет элемент
        let item_seq = _this.active_item_id ? _this.mission_items_collection.getIndexById(_this.active_item_id) + 1 : 0;

        let new_alt = 5;
        if( item_seq > 1 ) {
            let prev_item = null;
            let prev_item_id = null;
            for (let i = item_seq - 1; i > 0; i--) {
                prev_item_id = _this.mission_items_collection.getIdByIndex(i);
                if (!prev_item_id) break;
                prev_item = _this.mission_items_collection.getItem(prev_item_id);
                if ('home' !== prev_item.id && prev_item.param7 !== null && prev_item.param7 !== undefined ) {
                    new_alt = prev_item.param7;
                    break;
                }

                //console.log(prev_item);
            }
        }
        else if( item_seq === 0 ){
            new_alt = 0;
        }

        // По умолчанию при клике на карту создается NAV_WAYPOINT
        let item_data = webix.copy(MAV_COMMANDS[16]);
        if( item_seq === 0 ) item_data.command = 'home';
        item_data.seq = item_seq;
        item_data.id = item_seq === 0 ? 'home' : webix.uid();
        item_data.param5 = event.latLng.lat();
        item_data.param6 = event.latLng.lng();
        if( new_alt !== null ) item_data.param7 = new_alt;

        // Добавляем в таблицу и на карту
        const item = _this.addFPItem(item_data);

        // Сохраняем новую точку маршрута
        if( item.seq >= 1 ){

            // Сохранить элемент полетного плана на сервере
            _this.createFPItem(item);

            // Пересчитываем общую длину маршрута
            _this.calcRouteLength();

            console.log('UPDATE RTL HERE');
            _this.updateRTLPath();

        }

        // Или устанавливаем точку старта
        else {
            // set mission home position
            _this.home_marker = item.marker;
            _this.updateHomePosition();
            _this.editWaypoint('home');

        }

        // Обновить маршрут возврата
        if( _this.end_marker_item_id === item.id) _this.updateRTLPath();

    }


    // Добавить элемент полетного плана на карту и в таблицу
    // Вызывается при
    //      загрузке данных из БД
    //      клике на карту в режиме добавления точек
    addFPItem(item){

        const _this = this;

        //
        // На вход приходит объект MISSION_ITEM или с сервера или изнутри

        const path = _this.map_route_path.getPath();

        //
        // Список команд для которых нужно рисовать маркер на карте
        // !!! этот список повторяется в MAVDroneClient для отображения миссии у дрона на карте
        const map_marker_commands = ['home', 16, 17, 18, 19, 21, 31, 82, 85];

        let marker = null;

        let items_count = _this.mission_items_collection.count();

        // Добавляем данные в таблицу по индексу seq
        //    5
        if( items_count <= item.seq ) _this.mission_items_collection.add(item);
        else _this.mission_items_collection.add(item, item.seq);

        // Если нужно маркер добавить на карту и есть параметры с координатами
        if( map_marker_commands.indexOf(item.command) !== -1 && item.param5 !== null && item.param6 !== null ){

            marker = new google.maps.Marker({
                position: {lat: item.param5, lng: item.param6}
                ,zIndex: item.param7 || 1
                ,clickable: true
                ,crossOnDrag: true
            });

            marker.path_seq = 0;

            if( item.seq > 0 ) {
                let prev_item = null;
                let prev_item_id = null;
                // Найти в таблице предыдущий маркер, взять его path_seq и добавить следующим текущий маркер
                for( let i = item.seq-1; i >= 0; i-- ){
                    prev_item_id = _this.mission_items_collection.getIdByIndex(i);
                    prev_item = _this.mission_items_collection.getItem(prev_item_id);
                    //console.log(prev_item);
                    if( prev_item && prev_item.marker ){
                        marker.path_seq = prev_item.marker.path_seq + 1;
                        break;
                    }
                }

                // Если это последний маркер
                if( _this.map_route_path.getPath().getLength() === marker.path_seq ){
                    _this.end_marker_item_id = item.id;
                }
            }

            // Добавляем точку на линию
            path.insertAt(marker.path_seq,  marker.getPosition());

            // Внешний вид маркера
            marker.setIcon( 'home' === item.id ? marker_icon_home : marker_icon_normal );

            // Символ на маркере и подсказка
            marker.setLabel( marker.path_seq > 0 ? {text: marker.path_seq.toString(), color: marker_icon_normal.strokeColor} : {text: 'H', color: marker_icon_home.strokeColor} );
            marker.title = marker.path_seq > 0 ? 'Alt: ' + item.param7 + ' m' : 'Home';

            // ID маркера (временный или из БД)
            marker.sid = item.id;
            marker.item_id = item.id;

            _this.mission_items_collection.updateItem(item.id, {marker: marker, marker_path_seq: marker.path_seq});

            // Клик по маркеру включает режим его редактирования
            marker.addListener('click', e => {
                _this.editWaypoint(marker.item_id);
            });

            // Маркер перемещен
            marker.addListener('dragend', () => {

                // Если это стартовый маркер, то сохраняем стартовую позицию
                if( 'home' === marker.item_id ){
                    _this.updateHomePosition();
                }
                // Сохраняем положение точки маршрута
                else {
                    let item = _this.mission_items_collection.getItem(marker.item_id);
                    _this.updateFPItem({seq: item.seq, param5: marker.getPosition().lat(), param6: marker.getPosition().lng()});
                }

                // Пересчитываем общую длину маршрута
                _this.calcRouteLength();

            });

            // Передвигаем линии маршрута и возврата вслед за маркером
            marker.addListener('drag', (e) => {

                // передвинем точку линии маршрута
                path.setAt(marker.path_seq, e.latLng);

                // Если это домашний или последний маркер, то передвигаем линию возврата
                if( 'home' === marker.item_id || _this.end_marker_item_id === marker.item_id ){
                    _this.updateRTLPath();
                }

            });

            // Если карта активна, то включаем маркер
            if( _this.view_enabled && _this.map ) marker.setMap(_this.map);

        }

        // Обновить последующие маркеры если элемент добавляется не в конец списка
        if( items_count !== item.seq ){

            let next_item_id = null;
            let next_item = null;

            for( let i = item.seq+1, k = _this.mission_items_collection.count(); i < k; i++ ){

                next_item_id = _this.mission_items_collection.getIdByIndex(i);
                if( !next_item_id ) break;

                next_item = _this.mission_items_collection.getItem(next_item_id);
                if( next_item ){
                    _this.mission_items_collection.updateItem(next_item_id, {seq: next_item.seq+1});
                    if( marker && next_item.marker ){
                        _this.mission_items_collection.updateItem(next_item_id, {marker_path_seq: next_item.marker_path_seq+1});
                        next_item.marker.path_seq += 1;
                        next_item.marker.setLabel( next_item.marker.path_seq > 0 ? {text: next_item.marker.path_seq.toString(), color: marker_icon_normal.strokeColor} : {text: 'H', color: marker_icon_home.strokeColor} );
                    }

                }
            }
        }

        // Возвращаем новый item
        return _this.mission_items_collection.getItem(item.id);

    }

    //
    // Сохранение нового элемента плана
    createFPItem(item){
        //const _this = this;

        let values = {
             id: this.id
            ,seq: item.seq
            ,command: item.command
            ,frame: item.frame
            ,param1: item.param1
            ,param2: item.param2
            ,param3: item.param3
            ,param4: item.param4
            ,param5: item.param5
            ,param6: item.param6
            ,param7: item.param7
        };

        window.app.getService('io').rpc('fpItemCreate', values)
            .then( data => { // в ответе только data.seq
                this.editWaypoint(item.id); // id новых элементов на фронте не соответсвуют сохраненным id на сервере
            })
            .catch( e => {
                Message.error('Failed to save new waypoint');
                this.removeFPItem(item.id, true);
            } );

    }


    // Обновление элемента плана
    updateFPItem(values){
        const _this = this;

        values.id = this.id;

        let item_id = _this.mission_items_collection.getIdByIndex(values.seq);
        if( !item_id ) return Message.error('Wrong item seq');

        window.app.getService('io').rpc('fpItemUpdate', values)
            .then( data => { // в ответе только data.seq
                delete values.id;
                if( item_id ) _this.mission_items_collection.updateItem(item_id, values);
            })
            .catch( e => {
                Message.error('Failed to save item');

                // Если сохранялись координаты маркера, то вернуть его назад
                if( values.param5 || values.param6 ){
                    let item = _this.mission_items_collection.getItem(item_id);
                    item.marker.setPosition({lat: item.param5, lng: item.param6});
                    _this.map_route_path.getPath().setAt(item.marker_path_seq, item.marker.getPosition());
                    if( _this.end_marker_item_id === item.id ){
                        _this.updateRTLPath();
                    }
                }
            });

    }

    //
    // Удаление элемента полетного плана
    removeFPItem(item_id, remove_on_client_only){
        const _this = this;

        // Блокируем всю таблицу
        _this.mission_items_table.disable();

        const item = _this.mission_items_collection.getItem(item_id);

        // Удаление элемента локально (Если после добавления на сервер произошла ошибка и нужно вернуть исходное состояние)
        const remove_on_client = function(){
            let seq = item.seq;

            //console.log(seq);

            // Удаляем элемент из таблицы
            _this.mission_items_collection.remove(item.id);

            // Удалить маркер с карты
            let ms = false;
            if( item.marker ){
                item.marker.setMap(null);
                // Удалить точку с маршрутной линии
                _this.map_route_path.getPath().removeAt(item.marker.path_seq);
                ms = true;

                // Если маркер был последний, найти предыдущий маркер и назначить его последним
                if( item.id === _this.end_marker_item_id ){

                    // находим предыдущий элемент с маркером, чтобы обозначить его последним
                    let prev_item_id = null;
                    let prev_item = null;
                    let end_marker_item_id = null;
                    for( let i = _this.mission_items_collection.count()-1, k = 1; i > k; i-- ){
                        prev_item_id = _this.mission_items_collection.getIdByIndex(i);
                        prev_item = _this.mission_items_collection.getItem(prev_item_id);
                        if( prev_item.marker && 'home' !== prev_item_id ){
                            end_marker_item_id = prev_item.id;
                            break;
                        }
                    }
                    _this.end_marker_item_id = end_marker_item_id; // Если элементов меньше 2, то будет null

                    // Обновить обратный путь
                    _this.updateRTLPath();
                }

                // Пересчитать длину маршрута
                _this.calcRouteLength();

            }

            // Перебираем последующие элементы, чтобы уменьшить их SEQ
            _this.mission_items_collection.data.each(function(i){
                // И уменьшаем порядковые номера после удаленной
                if( i.seq > seq ){
                    _this.mission_items_collection.updateItem(i.id, {seq: i.seq-1});

                    if( ms && i.marker ) {
                        _this.mission_items_collection.updateItem(i.id, {marker_path_seq: i.marker_path_seq-1});
                        i.marker.path_seq = i.marker.path_seq-1;
                        i.marker.setLabel(i.marker.path_seq.toString()+'');
                    }
                }
            });

            // Разблокиуем таблицу
            _this.mission_items_table.enable();

        };

        if( remove_on_client_only ){

            remove_on_client();

        }
        else {

            window.app.getService('io').rpc('fpItemRemove', {id: this.id, seq: item.seq})
                .then( remove_on_client )
                .catch( e => {
                    Message.error('Ошибка удаления точки');
                    _this.mission_items_table.enable();
                });

        }


    }

    //
    // Обновить координаты маршрута возврата
    updateRTLPath(){
        const _this = this;

        if( !_this.data.getValues().rtl_end ){
            _this.rtl_path.setMap(null);
            return;
        }

        if( _this.home_marker && _this.end_marker_item_id && 'home' !== _this.end_marker_item_id ){
            let end_marker_item = _this.mission_items_collection.getItem(_this.end_marker_item_id);
            if( end_marker_item && end_marker_item.marker ){
                _this.rtl_path.setPath([_this.home_marker.getPosition(), end_marker_item.marker.getPosition()]);
                if( _this.data.getValues().rtl_end ) _this.rtl_path.setMap(_this.map);
            }
        }
        else {
            _this.rtl_path.setMap(null);
        }



    }


    // Обновление координат точки старта
    updateHomePosition(){
        const _this = this;

        let home_pos = {lat: _this.home_marker.getPosition().lat(), lng: _this.home_marker.getPosition().lng()};

        _this.save({home: home_pos})
            .then(function(){
                _this.data.setValues({home: home_pos}, true);
            })
            .catch(function(e){
                // Вернуть домашнюю точку назад
                Message.error('Failed to save new home position');
                if( _this.data.getValues().home ){
                    _this.home_marker.setPosition(_this.data.getValues().home);
                    _this.map_route_path.getPath().setAt(0, _this.home_marker.getPosition());
                    _this.updateRTLPath();
                }
            });

        _this.view.$scope.address_popup.hide();



        if( !_this.data.getValues().location || (_this.data.getValues().location && _this.data.getValues().location.length < 2) && geocoder) {

            geocoder.geocode({'location': {lng: _this.home_marker.getPosition().lng(), lat: _this.home_marker.getPosition().lat()}}, function(results, status) {
                if (status === 'OK') {
                    if (results[1]) {
                        let new_location = results[1].formatted_address;
                        _this.save({location: new_location})
                            .then(function(){
                                _this.data.setValues({location: new_location}, true);
                                _this.mission_form.setValues({location: new_location}, true);
                            })
                            .catch(function(){
                                Message.error('Failed to save new location');
                            });
                    }
                }
            });
        }


        /*
        //
        // Check consistency
        let item_id = null;
        let item = null;
        let c = true;
        for( let i = 0, k = _this.mission_items_collection.count(); i < k; i++ ){
            item_id = _this.mission_items_collection.getIdByIndex(i);
            item = _this.mission_items_collection.getItem(item_id);

            if( item.seq !== i ) c = false;
            if( item.marker ){
                if( item.marker_path_seq !== item.marker.path_seq ) c = false;
                if( item.marker.item_id !== item.id ) c = false;
            }
        }

        console.log('CONS: ' + (c ? 'OK' : 'failed'));
        */

    }


    // Включение режима редактирования у маркера
    editWaypoint(id){

        const _this = this;
        const item = _this.mission_items_collection.getItem(id);

        // Если клик на уже активированном для редактирования маркере, то деактивируем его
        if( _this.active_item_id && _this.active_item_id.toString() === id.toString()+'' ){
            _this.mission_items_table.unselectAll();
            _this.mission_items_table.closeSub(id);

            if( item.marker ){
                item.marker.setIcon( item.marker.path_seq === 0 ? marker_icon_home : marker_icon_normal );
                item.marker.setLabel({
                    text: ( item.marker.path_seq === 0 ? 'H' : item.marker_path_seq.toString()+'' )
                    ,color: (item.marker.path_seq === 0 ? marker_icon_home.strokeColor : marker_icon_normal.strokeColor)});
                item.marker.setDraggable(false);
            }

            _this.active_item_id = null;
            //_this.view.$scope.point_popup.hide();
        }

        // А если клик на еще не активном маркере, то сначала нужно закрыть все остальные, а потом открыть текущий
        else {
            // отключаем редактирование у всех маркеров
            _this.mission_items_table.data.each(obj => {
                if( obj.marker ){
                    obj.marker.setIcon( obj.marker.path_seq === 0 ? marker_icon_home : marker_icon_normal );
                    obj.marker.setLabel({
                        text: (obj.marker.path_seq === 0 ? 'H' : obj.marker_path_seq.toString()+'' )
                        ,color: (obj.marker.path_seq === 0 ? marker_icon_home.strokeColor : marker_icon_normal.strokeColor)});
                    obj.marker.setDraggable(false);
                }

                if( _this.mission_items_table.closeSub ) _this.mission_items_table.closeSub(obj.id);
            } );

            // очищаем выбор в таблице точек
            _this.mission_items_table.unselectAll();

            // включаем редактирование у кликнутого
            if( item ) {
                _this.mission_items_table.select(id);
                _this.mission_items_table.showItem(id);

                if( item.marker ){
                    item.marker.setIcon(marker_icon_edit);
                    item.marker.setLabel({
                        text: item.marker_path_seq === 0 ? 'H' : item.marker_path_seq.toString()+''
                        ,color: marker_icon_edit.strokeColor
                    });
                    item.marker.setDraggable(true);
                }

                _this.active_item_id = id.toString() + '';
                _this.mission_items_table.openSub(id);

                // Двигаем карту в центр маркера (не очень красиво, маркер уходит из-под клика)
                //_this.map.setCenter(point.marker.getPosition());

            }

        }

    }


    // Расчет длины маршрута
    calcRouteLength(){

        const _this = this;

        //
        const route_data_tpl = _this.view.$scope.$$('tpl:route_data');

        //let way_path = [ [LNG, LAT], [], [] ];  _this.map_route_path; _this.rtl_path;

        let count_path = [];

        let waypath = _this.map_route_path.getPath();

        if( waypath.getLength() > 1 ){

            waypath.forEach(function(i){
                if( i && i.lng() ) count_path.push([i.lng(), i.lat()]);
            });

            if( _this.data.getValues().rtl_end ){
                count_path.push([_this.home_marker.getPosition().lng(), _this.home_marker.getPosition().lat()]);
            }

            let route_dist = Math.round( turf.length(turf.lineString( count_path ))*10 ) / 10; // km

            route_data_tpl.setValues({
                dist: route_dist
            });

        }

    }


    // Вызывается при закрытии вида
    destroy_view(){
        const _this = this;

        _this.active_item_id = null;
        _this.view_enabled = false;
    }


}

