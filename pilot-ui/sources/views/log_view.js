import {JetView} from "webix-jet";
import helpers from '../../../utils/helpers';
import LogsCollection from "../models/LogsCollection";
import Message from "../plugins/Message";
import Highcharts from 'highcharts';


let top_controls_id = null;


export default class LogView extends JetView {

    config(){
        return view_config;
    }

    init(view, url){

        top_controls_id = webix.$$('top_view_controls').addView(top_controls);

    }

    ready(view, url){

        // drone_id передается в параметре открытия вида
        const log_id = this.getParam("id");

        console.log('LOG ID', log_id);

        // Если параметра нет или он не найден в коллекции
        // Открыть список
        if( !log_id || !LogsCollection.getItem(log_id) ){
            this.app.show('/app/logs_list');
            console.log('LOG NOT FOUND');
            return;
        }

        console.log('LOG FOUND');

        const log_item = LogsCollection.getItem(log_id);

        // Сделать в заголовке ссылку на список и добавить название лога
        this.app.getService('topTitle').update([{text: 'Logs', link: '/app/logs_list'}, {text: log_item.name}]);

        // Top controls
        const btn_remove = webix.$$('log_view:btn:trash');
        const switch_modes = webix.$$('log_view:sw:modes');
        const switch_errors = webix.$$('log_view:sw:errors');

        // View controls
        const map = this.$$('map:drone');
        const list_errs = this.$$('list:errors');
        const list_msgs = this.$$('list:messages');
        const list_events = this.$$('list:events');
        const info_tpl = this.$$('tpl:info');
        const msg_tree = this.$$('tree:msg');
        const btn_uncheck_all = this.$$('btn:uncheck_all');

        // Создание вида после загрузки карты
        map.getMap(true).then(function(mapObj) {
            // Установка параметров карты
            mapObj.setOptions(map_options);
        });

        // Кнопка Удалить лог
        btn_remove.attachEvent('onItemClick', () => {
            webix.confirm({
                ok: "Remove",
                cancel: "Cancel",
                text: "This log will be COMPLETELY REMOVED!",
                callback: (result) => {
                    if( result ) {
                        LogsCollection.Remove(log_id)
                            .then(function(){Message.info('Log removed')})
                            .catch(console.log);
                        this.show('logs_list');
                    }
                }
            });
        });


        const att_chart = Highcharts.chart('log_att_chart', {
            chart: {
                type: 'line'
                ,zoomType: 'x'
            },
            title: {text: 'Attitude'},
            boost: {
                enabled: true
            },
            plotOptions: {
                series: {
                    allowPointSelect: false
                }
                ,line: {
                    marker: {
                        enabled: false
                    }
                }
            },
            yAxis: {
                title: {
                    text: 'att'
                }
            },
            xAxis: {
                title: {
                    text: 'Log time, seconds'
                },
                labels: {
                    formatter: function() {
                        return this.value/100;
                    }
                }
                ,type: 'linear'
            },
            legend: {
                align: 'center',
                verticalAlign: 'top'
            },
            tooltip: {
                enabled: false
            }
            ,credits: {
                enabled: false
            }
            ,series: []
        });

        const vibe_xyz_chart = Highcharts.chart('log_vibe_xyz_chart', {
            chart: {
                type: 'line'
                ,zoomType: 'x'
            },
            title: { text: 'Vibration' },
            boost: {
                enabled: true
            },
            plotOptions: {
                series: {
                    allowPointSelect: false
                }
                ,line: {
                    marker: {
                        enabled: false
                    }
                }
            },
            yAxis: {
                title: {
                    text: 'm/s/s'
                }
                ,gridLineWidth: 0
                ,plotBands: [
                    { // Green
                        from: 0,
                        to: 25,
                        color: 'rgba(46,211,15,0.10)',
                        label: {
                            text: 'OK',
                            style: {
                                color: '#555555'
                            }
                        }
                    }
                    ,{ // Yellow
                        from: 25,
                        to: 50,
                        color: 'rgba(255,188,56,0.10)',
                        label: {
                            text: 'Check',
                            style: {
                                color: '#555555'
                            }
                        }
                    }
                    ,{ // Red
                        from: 50,
                        to: 1000,
                        color: 'rgba(255,47,49,0.10)',
                        label: {
                            text: 'Danger',
                            style: {
                                color: '#555555'
                            }
                        }
                    }
                ]
            },
            xAxis: {
                title: {
                    text: 'Log time, seconds'
                },
                labels: {
                    formatter: function() {
                        return this.value/100;
                    }
                }
                ,type: 'linear'
            },
            legend: {
                align: 'center',
                verticalAlign: 'top'
            },
            tooltip: {
                enabled: false
            }
            ,credits: {
                enabled: false
            }
            ,series: []
        });

        const vibe_clip_chart = Highcharts.chart('log_vibe_clip_chart', {
            chart: {
                type: 'line'
                ,zoomType: 'x'
            },
            title: {
                text: 'Vibration Clips'
            },
            boost: {
                enabled: true
            },
            plotOptions: {
                series: {
                    allowPointSelect: false
                }
                ,line: {
                    marker: {
                        enabled: false
                    }
                }
            },
            yAxis: {
                title: {
                    text: 'counter'
                }
                ,gridLineWidth: 0
            },
            xAxis: {
                title: {
                    text: 'Log time, seconds'
                },
                labels: {
                    formatter: function() {
                        return this.value/100;
                    }
                }
                ,type: 'linear'
            },
            legend: {
                align: 'center',
                verticalAlign: 'top'
            },
            tooltip: {
                enabled: true
            }
            ,credits: {
                enabled: false
            }
            ,series: []
        });

        const alt_chart = Highcharts.chart('log_alt_chart', {
            chart: {
                type: 'line'
                ,zoomType: 'x'
            },
            title: {
                text: 'Altitude'
            },
            boost: {
                enabled: true
            },
            plotOptions: {
                series: {
                    allowPointSelect: false
                }
                ,line: {
                    marker: {
                        enabled: false
                    }
                }
            },
            yAxis: {
                title: {
                    text: ''
                }
                ,gridLineWidth: 0
            },
            xAxis: {
                title: {
                    text: 'Log time, seconds'
                },
                labels: {
                    formatter: function() {
                        return this.value/100;
                    }
                }
                ,type: 'linear'
            },
            legend: {
                align: 'center',
                verticalAlign: 'top'
            },
            tooltip: {
                enabled: true
            }
            ,credits: {
                enabled: false
            }
            ,series: []
        });

        const cr_chart = Highcharts.chart('log_cr_chart', {
            chart: {
                type: 'line'
                ,zoomType: 'x'
            },
            title: {
                text: 'Climb Rate'
            },
            boost: {
                enabled: true
            },
            plotOptions: {
                series: {
                    allowPointSelect: false
                }
                ,line: {
                    marker: {
                        enabled: false
                    }
                }
            },
            yAxis: {
                title: {
                    text: ''
                }
                ,gridLineWidth: 0
            },
            xAxis: {
                title: {
                    text: 'Log time, seconds'
                },
                labels: {
                    formatter: function() {
                        return this.value/100;
                    }
                }
                ,type: 'linear'
            },
            legend: {
                align: 'center',
                verticalAlign: 'top'
            },
            tooltip: {
                enabled: true
            }
            ,credits: {
                enabled: false
            }
            ,series: []
        });

        const pl_chart = Highcharts.chart('log_pl_chart', {
            chart: {
                type: 'line'
                ,zoomType: 'x'
            },
            title: {
                text: 'Precision Landing Sensor'
            },
            boost: {
                enabled: true
            },
            plotOptions: {
                series: {
                    allowPointSelect: false
                }
                ,line: {
                    marker: {
                        enabled: false
                    }
                }
            },
            yAxis: [
                {
                    title: {
                        text: 'Position, Velocity'
                    }
                    ,gridLineWidth: 0
                }
                ,{
                    title: {
                        text: 'Health, Target Acquired'
                    }
                    ,gridLineWidth: 0
                    ,opposite: true
                }
            ]
            ,xAxis: {
                title: {
                    text: 'Log time, seconds'
                },
                labels: {
                    formatter: function() {
                        return this.value/100;
                    }
                }
                ,type: 'linear'
            },
            legend: {
                align: 'center',
                verticalAlign: 'top'
            },
            tooltip: {
                enabled: true
            }
            ,credits: {
                enabled: false
            }
            ,series: []
        });

        const of_chart = Highcharts.chart('log_of_chart', {
            chart: {
                type: 'line'
                ,zoomType: 'x'
            },
            title: {
                text: 'Optical Flow Sensor'
            },
            boost: {
                enabled: true
            },
            plotOptions: {
                series: {
                    allowPointSelect: false
                }
                ,line: {
                    marker: {
                        enabled: false
                    }
                }
            },
            yAxis: [
                {
                    title: {
                        text: 'Flow and Body position'
                    }
                    ,gridLineWidth: 0
                }
                ,{
                    title: {
                        text: 'Quality'
                    }
                    ,gridLineWidth: 0
                    ,opposite: true
                }
            ]
            ,xAxis: {
                title: {
                    text: 'Log time, seconds'
                },
                labels: {
                    formatter: function() {
                        return this.value/100;
                    }
                }
                ,type: 'linear'
            },
            legend: {
                align: 'center',
                verticalAlign: 'top'
            },
            tooltip: {
                enabled: true
            }
            ,credits: {
                enabled: false
            }
            ,series: []
        });

        const custom_chart = Highcharts.chart('custom_chart', {
            chart: {
                type: 'line'
                ,zoomType: 'x'
            },
            title: {
                text: 'Custom graphs'
            },
            boost: {
                enabled: true
            },
            plotOptions: {
                series: {
                    allowPointSelect: false
                }
                ,line: {
                    marker: {
                        enabled: false
                    }
                }
            },
            yAxis: {
                title: {
                    text: ''
                }
                ,gridLineWidth: 0
            },
            xAxis: {
                title: {
                    text: 'Log time, seconds'
                },
                labels: {
                    formatter: function() {
                        return this.value/100;
                    }
                }
                ,type: 'linear'
            },
            legend: {
                align: 'center',
                verticalAlign: 'top'
            },
            tooltip: {
                enabled: true
            }
            ,credits: {
                enabled: false
            }
            ,series: []
        });


        const charts = {
            att_chart: att_chart
            ,vibe_xyz_chart: vibe_xyz_chart
            ,vibe_clip_chart: vibe_clip_chart
            ,alt_chart: alt_chart
            ,cr_chart: cr_chart
            ,pl_chart: pl_chart
            ,of_chart: of_chart
            ,custom_chart: custom_chart
        };

        let modes_timeline = [];
        let modes_colors = {};
        let errors_timeline = [];


        // Показать полетные режимы на графиках
        const show_modes = function(){
            if( !modes_timeline.length ) return;

            for( let chart_name in charts ){
                if( !charts.hasOwnProperty(chart_name) ) continue;

                modes_timeline.forEach( mode => {
                    charts[chart_name].xAxis[0].addPlotBand({
                        color: modes_colors[mode.num]
                        ,from: mode.start
                        ,to: mode.end
                        ,id: mode.start + '_' + mode.name
                        ,label: {
                            text: mode.name
                            ,align: 'left'
                        }
                    });
                })
            }
        };

        // Отключить полетные режимы на графиках
        const hide_modes = function(){
            if( !modes_timeline.length ) return;

            for( let chart_name in charts ) {
                if (!charts.hasOwnProperty(chart_name)) continue;

                modes_timeline.forEach( mode => {
                    charts[chart_name].xAxis[0].removePlotBand(mode.start + '_' + mode.name);
                })
            }
        };

        // Показать ошибки на графиках
        const show_errors = function(){
            if( !errors_timeline.length ) return;

            for( let chart_name in charts ) {
                if (!charts.hasOwnProperty(chart_name)) continue;

                errors_timeline.forEach( el => {
                    charts[chart_name].xAxis[0].addPlotLine({
                        color: 'red'
                        ,dashStyle: 'Dash'
                        ,value: el.t/10000
                        ,width: 2
                        ,id: el.t
                        ,label: {
                            text: el.msg
                        }
                    });
                });
            }
        };

        // Отключить ошибки на графиках
        const hide_errors = function(){
            if( !errors_timeline.length ) return;

            for( let chart_name in charts ) {
                if (!charts.hasOwnProperty(chart_name)) continue;

                errors_timeline.forEach( el => {
                    charts[chart_name].xAxis[0].removePlotLine(el.t);
                });
            }
        };


        switch_modes.attachEvent('onChange', value => {
            if( !!value ) show_modes();
            else hide_modes();
        });

        switch_errors.attachEvent('onChange', value => {
            if( !!value ) show_errors();
            else hide_errors();
        });

        let custom_series = {};

        btn_uncheck_all.attachEvent('onItemClick', msg_tree.uncheckAll );

        msg_tree.attachEvent("onItemCheck", function(ser_ind, checked){

            if( checked ){
                window.app.getService('io').rpc('logGetSeries', {id: log_id, series: [ser_ind]})
                    .then( data => {
                        custom_series[ser_ind] = charts.custom_chart.addSeries({
                            name: ser_ind
                            ,lineWidth: 1
                            ,data: data.series[ser_ind]
                        });
                    } )
                    .catch( err => {
                        Message.error('Failed to load data: ' + err);
                    } );
            }
            else {
                if( custom_series[ser_ind] ){
                    custom_series[ser_ind].remove();
                    custom_series[ser_ind] = null;
                }
            }

        });

        LogsCollection.Get(log_id)
            .then( data => {
                console.log('Log data', data);

                list_errs.parse(data.errors);
                list_msgs.parse(data.messages);
                list_events.parse(data.events);

                // Инфо
                info_tpl.setValues(data.info);

                // Tree
                msg_tree.clearAll();
                msg_tree.parse(data.msg_tree);
                msg_tree.sort('value', 'asc');

                // TODO сделать загрузки из новой функции

                // Положение ATT
                if( data.log_data.ATT ){
                    charts.att_chart.addSeries({
                        name: 'Desired Roll'
                        ,lineWidth: 1
                        ,data: data.log_data.ATT.DesRoll
                    });
                    charts.att_chart.addSeries({
                        name: 'Actual Roll'
                        ,lineWidth: 1
                        ,data: data.log_data.ATT.Roll
                    });
                    charts.att_chart.addSeries({
                        name: 'Desired Pitch'
                        ,lineWidth: 1
                        ,data: data.log_data.ATT.DesPitch
                    });
                    charts.att_chart.addSeries({
                        name: 'Actual Pitch'
                        ,lineWidth: 1
                        ,data: data.log_data.ATT.Pitch
                    });
                    charts.att_chart.addSeries({
                        name: 'Desired Yaw'
                        ,lineWidth: 1
                        ,data: data.log_data.ATT.DesYaw
                    });
                    charts.att_chart.addSeries({
                        name: 'Actual Yaw'
                        ,lineWidth: 1
                        ,data: data.log_data.ATT.Yaw
                    });
                }

                // Вибрация
                if( data.log_data.VIBE ){
                    if( data.log_data.VIBE.hasOwnProperty('VibeX') ){
                        charts.vibe_xyz_chart.addSeries({
                            name: 'X'
                            ,lineWidth: 1
                            ,data: data.log_data.VIBE.VibeX
                            ,color: '#0f0eff'
                        });
                    }
                    if( data.log_data.VIBE.hasOwnProperty('VibeY') ){
                        charts.vibe_xyz_chart.addSeries({
                            name: 'Y'
                            ,lineWidth: 1
                            ,data: data.log_data.VIBE.VibeY
                            ,color: '#ff291c'
                        });
                    }
                    if( data.log_data.VIBE.hasOwnProperty('VibeZ') ){
                        charts.vibe_xyz_chart.addSeries({
                            name: 'Z'
                            ,lineWidth: 1
                            ,data: data.log_data.VIBE.VibeZ
                            ,color: '#c500ff'
                        });
                    }

                    if( data.log_data.VIBE.hasOwnProperty('Clip0') ){
                        charts.vibe_clip_chart.addSeries({
                            name: 'Clip 0'
                            ,lineWidth: 2
                            ,data: data.log_data.VIBE.Clip0
                        });
                    }
                    if( data.log_data.VIBE.hasOwnProperty('Clip1') ){
                        charts.vibe_clip_chart.addSeries({
                            name: 'Clip 1'
                            ,lineWidth: 2
                            ,data: data.log_data.VIBE.Clip1
                        });
                    }
                    if( data.log_data.VIBE.hasOwnProperty('Clip2') ){
                        charts.vibe_clip_chart.addSeries({
                            name: 'Clip 2'
                            ,lineWidth: 2
                            ,data: data.log_data.VIBE.Clip2
                        });
                    }
                }

                // Высоты и вертикальное ускорение
                if( data.log_data.CTUN ){
                    if( data.log_data.CTUN.hasOwnProperty('Alt') ){
                        charts.alt_chart.addSeries({
                            name: 'EKF Altitude'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['Alt']
                        });
                    }
                    if( data.log_data.CTUN.hasOwnProperty('DAlt') ){
                        charts.alt_chart.addSeries({
                            name: 'Desired Altitude'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['DAlt']
                        });
                    }
                    if( data.log_data.CTUN.hasOwnProperty('BAlt') ){
                        charts.alt_chart.addSeries({
                            name: 'Baro Altitude'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['BAlt']
                        });
                    }
                    if( data.log_data.CTUN.hasOwnProperty('DSAlt') ){
                        charts.alt_chart.addSeries({
                            name: 'Desired RF Altitude'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['DSAlt']
                        });
                    }
                    if( data.log_data.CTUN.hasOwnProperty('SAlt') ){
                        charts.alt_chart.addSeries({
                            name: 'RF Altitude'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['SAlt']
                        });
                    }

                    if( data.log_data.CTUN.hasOwnProperty('CRt') ){
                        charts.cr_chart.addSeries({
                            name: 'Actual rate'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['CRt']
                        });
                    }
                    if( data.log_data.CTUN.hasOwnProperty('DCRt') ){
                        charts.cr_chart.addSeries({
                            name: 'Desired rate'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['DCRt']
                        });
                    }
                }

                // PL
                if( data.log_data.PL ){
                    charts.pl_chart.addSeries({
                        name: 'X position'
                        ,lineWidth: 1
                        ,data: data.log_data.PL['pX']
                        ,yAxis: 0
                    });
                    charts.pl_chart.addSeries({
                        name: 'Y position'
                        ,lineWidth: 1
                        ,data: data.log_data.PL['pY']
                        ,yAxis: 0
                    });
                    charts.pl_chart.addSeries({
                        name: 'X velocity'
                        ,lineWidth: 1
                        ,data: data.log_data.PL['vX']
                        ,yAxis: 0
                    });
                    charts.pl_chart.addSeries({
                        name: 'Y velocity'
                        ,lineWidth: 1
                        ,data: data.log_data.PL['vY']
                        ,yAxis: 0
                    });
                    charts.pl_chart.addSeries({
                        name: 'Sensor health'
                        ,lineWidth: 2
                        ,data: data.log_data.PL['Heal']
                        ,yAxis: 1
                    });
                    charts.pl_chart.addSeries({
                        name: 'Target acquired'
                        ,lineWidth: 3
                        ,data: data.log_data.PL['TAcq']
                        ,yAxis: 1
                    });
                }

                // OF
                if( data.log_data.OF ){
                    charts.of_chart.addSeries({
                        name: 'Flow X'
                        ,lineWidth: 1
                        ,data: data.log_data.OF['flowX']
                        ,yAxis: 0
                    });
                    charts.of_chart.addSeries({
                        name: 'Flow Y'
                        ,lineWidth: 1
                        ,data: data.log_data.OF['flowY']
                        ,yAxis: 0
                    });
                    charts.of_chart.addSeries({
                        name: 'Body X'
                        ,lineWidth: 1
                        ,data: data.log_data.OF['bodyX']
                        ,yAxis: 0
                    });
                    charts.of_chart.addSeries({
                        name: 'Body Y'
                        ,lineWidth: 1
                        ,data: data.log_data.OF['bodyX']
                        ,yAxis: 0
                    });
                    charts.of_chart.addSeries({
                        name: 'Quality'
                        ,lineWidth: 1
                        ,data: data.log_data.OF['Qual']
                        ,yAxis: 1
                    });
                }


                /* произвольные поля
                if( data.log_data.CTUN ){
                    for (let field in data.log_data.CTUN) {
                        if (data.log_data.CTUN.hasOwnProperty(field)) {
                            ctun_chart.addSeries({
                                name: field
                                ,lineWidth: 1
                                ,data: data.log_data.CTUN[field]
                            });
                        }
                    }
                }
                 */

                // Ошибки на графиках
                if( data.errors && data.errors.length ) errors_timeline = data.errors;

                // Подготовка набора цветов для отображения полетных режимов
                if( data.modes && data.modes.length ) {
                    modes_timeline = data.modes;

                    // Подготовить набор цветов для отображения режимов
                    let mode_colors_set = [
                        'rgba(255,250,32,0.3)'
                        ,'rgba(255,7,164,0.3)'
                        ,'rgba(98,5,255,0.3)'
                        ,'rgba(10,65,255,0.3)'
                        ,'rgba(9,255,93,0.3)'
                        ,'rgba(71,83,96,0.3)'
                        ,'rgba(255,195,16,0.3)'
                        ,'rgba(255,47,49,0.3)'
                    ];
                    modes_timeline.forEach( mode => {
                        if( !modes_colors.hasOwnProperty(mode.num) ) modes_colors[mode.num] = mode_colors_set[Math.floor(Math.random() * mode_colors_set.length)];
                    });
                }

                // Показать режимы
                if( !!switch_modes.getValue() ) show_modes();

                // Скрыть режимы
                if( !!switch_errors.getValue() ) show_errors();

                // Отрисовка пути на карте
                map.getMap(true).then(function(mapObj) {

                    let gps_path = new google.maps.Polyline({
                        path: [],
                        geodesic: true,
                        strokeColor: '#ff1500',
                        strokeOpacity: 0.8,
                        strokeWeight: 4,
                        zIndex: 10
                    });
                    let pos_path = new google.maps.Polyline({
                        path: [],
                        geodesic: true,
                        strokeColor: '#fffa20',
                        strokeOpacity: 0.8,
                        strokeWeight: 4,
                        zIndex: 9
                    });

                    let map_center = null;

                    if( data.pos_pos && data.pos_pos.length > 2 ){
                        pos_path.setPath(data.pos_pos);
                        pos_path.setMap(mapObj);
                        map_center = data.pos_pos[0];
                    }

                    if( data.pos_gps && data.pos_gps.length > 2 ){
                        gps_path.setPath(data.pos_gps);
                        gps_path.setMap(mapObj);
                        map_center = data.pos_gps[0];
                    }
                    if( map_center ){
                        mapObj.setCenter(map_center);
                        mapObj.setZoom(18);
                    }

                });

            })
            .catch( Message.error );

    }

    destroy(){
        if( webix.$$('top_view_controls') && top_controls_id ){
            webix.$$('top_view_controls').removeView(top_controls_id);
            top_controls_id = null;
        }
    }

}


//
// Кнопки для верхней панели
//
// Кнопки для верхней панели приложения
const top_controls = {
    cols: [
        { view: 'switch', id: 'log_view:sw:modes', value: 0, labelRight: 'Show modes', labelWidth: 0}
        ,{width: 30}
        ,{ view: 'switch', id: 'log_view:sw:errors', value: 0, labelRight: 'Show errors', labelWidth: 0}
        ,{gravity: 4}
        // Кнопка Удалить полетный план
        ,{
            view: 'icon'
            ,type: 'iconButton'
            ,id: 'log_view:btn:trash'
            ,icon: 'mdi mdi-delete'
            ,tooltip: 'Remove this log'
        }
    ]
};


// Параметры карты
const map_options = {
    fullscreenControl: false
    ,panControl: false
    ,rotateControl: false
    ,streetViewControl: false
    ,scaleControl: false
    ,zoomControlOptions: {
        position: google.maps.ControlPosition.LEFT_BOTTOM
    }
    ,mapTypeControlOptions: {
        position: google.maps.ControlPosition.BOTTOM_LEFT
    }
};
const map_config = {
     view:"google-map"
    ,localId: "map:drone"
    ,zoom: 10
    ,mapType: 'SATELLITE'
    ,center:[ 55, 37 ]
    ,gravity: 3
};

// Основной вид
const view_config = {
    padding: 0
    ,borderless: true
    ,border: false
    ,localId: 'body'
    ,view: 'scrollview'
    ,scroll: 'y'
    ,body: {
        rows: [
            // Карта и таббар с инфо, ошибками и сообщениями
            {
                height: 400
                ,cols: [

                    map_config

                    ,{
                        gravity: 2
                        ,rows: [
                            // TABs
                            {
                                 view: 'tabbar'
                                ,value: 'log_info'
                                ,multiview: true
                                ,options: [
                                     { value: 'Info', id: 'log_info' }
                                    ,{ value: 'Errors', id: 'log_errors' }
                                    ,{ value: 'Messages', id: 'log_messages' }
                                    ,{ value: 'Events', id: 'log_events' }
                                ]
                            }

                            // Cells
                            ,{
                                animate: false
                                ,cells:[
                                    // Info
                                    {
                                        view: 'template'
                                        ,id: 'log_info'
                                        ,localId: 'tpl:info'
                                        ,template:  function(data){
                                            return 'Type: ' + (data.type || '') + '<br/>' +
                                                'Log time: ' + (data.log_time ? helpers.readable_seconds(data.log_time) : '')
                                        }
                                        ,height: 100
                                        ,borderless: true
                                    }

                                    // Errors
                                    ,{
                                        view: 'list'
                                        ,id: 'log_errors'
                                        ,localId: 'list:errors'
                                        ,template: function(row){
                                            return helpers.readable_seconds(Math.round(row.t/1000000)) + ' ' + row.msg;
                                        }
                                    }

                                    // Messages
                                    ,{
                                        view: 'list'
                                        ,id: 'log_messages'
                                        ,localId: 'list:messages'
                                        ,template: function(row){
                                            return helpers.readable_seconds(row.t) + ' ' + row.msg;
                                        }
                                    }

                                    // Events
                                    ,{
                                        view: 'list'
                                        ,id: 'log_events'
                                        ,localId: 'list:events'
                                        ,template: function(row){
                                            return helpers.readable_seconds(row.t) + ' ' + row.ev;
                                        }
                                    }

                                ]
                            }
                        ]
                    }
                ]
            }

            ,{ height: 30, borderless: true }

            // Вибрация X, Y, Z
            ,{ template: '<div id="log_vibe_xyz_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }
            // Вибрация Clip 0-2
            ,{ template: '<div id="log_vibe_clip_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // ATT
            ,{ template: '<div id="log_att_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // Высоты
            ,{ template: '<div id="log_alt_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // Climb Rate
            ,{ template: '<div id="log_cr_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // Precision Landing
            ,{ template: '<div id="log_pl_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // Oprical Flow
            ,{ template: '<div id="log_of_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // Custom chart
            ,{
                cols: [

                    { template: '<div id="custom_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true, gravity: 3}

                    ,{
                        gravity: 1
                        ,rows: [
                            { view: 'toolbar', elements:[{ view: 'button', label: 'Uncheck all', type: 'iconButton', icon: 'mdi mdi-cancel', localId: 'btn:uncheck_all'},{}]}
                            ,{
                                gravity: 1
                                ,view: 'tree'
                                ,localId: 'tree:msg'
                                ,template: function(obj, common){
                                    return common.icon(obj, common) + (obj.$level === 1 ? '' : common.checkbox(obj, common) ) + "&nbsp;<span>"+obj.value+"</span>";
                                }
                            }
                        ]
                    }
                ]
            }
            ,{ height: 50, borderless: true  }

        ]
    }
};
