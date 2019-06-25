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

        // Если параметра нет или он не найден в коллекции
        // Открыть список
        if( !log_id || !LogsCollection.getItem(log_id) ){
            this.app.show('/app/dataflash_logs_list');
            return;
        }

        const log_item = LogsCollection.getItem(log_id);

        // Сделать в заголовке ссылку на список и добавить название лога
        this.app.getService('topTitle').update([{text: 'Logs', link: '/app/dataflash_logs_list'}, {text: log_item.location}]);

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
                        this.show('dataflash_logs_list');
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
        // Определенные цвета для режимов
        let modes_colors = {
             0: 'rgba(255,250,32,0.2)'
            ,3: 'rgba(9,255,93,0.2)'
            ,4: 'rgba(255,7,164,0.2)'
            ,5: 'rgba(10,65,255,0.2)'
            ,6: 'rgba(71,83,96,0.2)'
            ,9: 'rgba(98,5,255,0.2)'
        };
        // Подготовить набор цветов для отображения режимов
        let mode_random_colors_set = [
            'rgba(255,250,32,0.2)'
            ,'rgba(255,7,164,0.2)'
            ,'rgba(98,5,255,0.2)'
            ,'rgba(10,65,255,0.2)'
            ,'rgba(9,255,93,0.2)'
            ,'rgba(71,83,96,0.2)'
            ,'rgba(255,195,16,0.2)'
            ,'rgba(255,47,49,0.2)'
        ];
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

        btn_uncheck_all.attachEvent('onItemClick', function(){
            msg_tree.uncheckAll();
        } );

        msg_tree.attachEvent("onItemCheck", function(ser_ind, checked){

            if( checked ){
                window.app.getService('io').rpc('logGetSeries', {id: log_id, series: [ser_ind]})
                    .then( data => {
                        custom_series[ser_ind] = charts.custom_chart.addSeries({
                            name: ser_ind
                            ,lineWidth: 1
                            ,data: data[ser_ind]
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


                // Загрузка данных для графиков по отдельности

                // Вибрация VIBE
                if( msg_tree.exists('VIBE') ){
                    window.app.getService('io').rpc('logGetSeries', {id: log_id, series: ['VIBE.VibeX', 'VIBE.VibeY', 'VIBE.VibeZ', 'VIBE.Clip0', 'VIBE.Clip1', 'VIBE.Clip2']})
                        .then( data => {

                            if( data.hasOwnProperty('VIBE.VibeX') ){
                                charts.vibe_xyz_chart.addSeries({
                                    name: 'X'
                                    ,lineWidth: 1
                                    ,data: data['VIBE.VibeX']
                                    ,color: '#0f0eff'
                                });
                            }
                            if( data.hasOwnProperty('VIBE.VibeY') ){
                                charts.vibe_xyz_chart.addSeries({
                                    name: 'Y'
                                    ,lineWidth: 1
                                    ,data: data['VIBE.VibeY']
                                    ,color: '#ff291c'
                                });
                            }
                            if( data.hasOwnProperty('VIBE.VibeZ') ){
                                charts.vibe_xyz_chart.addSeries({
                                    name: 'Z'
                                    ,lineWidth: 1
                                    ,data: data['VIBE.VibeZ']
                                    ,color: '#c500ff'
                                });
                            }
                            if( data.hasOwnProperty('VIBE.Clip0') ){
                                charts.vibe_clip_chart.addSeries({
                                    name: 'Clip 0'
                                    ,lineWidth: 2
                                    ,data: data['VIBE.Clip0']
                                });
                            }
                            if( data.hasOwnProperty('VIBE.Clip1') ){
                                charts.vibe_clip_chart.addSeries({
                                    name: 'Clip 1'
                                    ,lineWidth: 2
                                    ,data: data['VIBE.Clip1']
                                });
                            }
                            if( data.hasOwnProperty('VIBE.Clip2') ){
                                charts.vibe_clip_chart.addSeries({
                                    name: 'Clip 2'
                                    ,lineWidth: 2
                                    ,data: data['VIBE.Clip2']
                                });
                            }
                        } )
                        .catch( err => {
                            Message.error('Failed to load data: ' + err);
                        } );
                }
                else {
                    this.$$('chart:vibe_xyz').hide();
                    this.$$('chart:vibe_clip').hide();
                }

                // Положение ATT
                if( msg_tree.exists('ATT') ){
                    window.app.getService('io').rpc('logGetSeries', {id: log_id, series: ['ATT.DesRoll', 'ATT.Roll', 'ATT.DesPitch', 'ATT.Pitch', 'ATT.DesYaw', 'ATT.Yaw']})
                        .then( data => {
                            if( data.hasOwnProperty('ATT.DesRoll') ){
                                charts.att_chart.addSeries({
                                    name: 'Desired Roll'
                                    ,lineWidth: 1
                                    ,data: data['ATT.DesRoll']
                                });
                            }
                            if( data.hasOwnProperty('ATT.Roll') ){
                                charts.att_chart.addSeries({
                                    name: 'Actual Roll'
                                    ,lineWidth: 1
                                    ,data: data['ATT.Roll']
                                });
                            }
                            if( data.hasOwnProperty('ATT.DesPitch') ){
                                charts.att_chart.addSeries({
                                    name: 'Desired Pitch'
                                    ,lineWidth: 1
                                    ,data: data['ATT.DesPitch']
                                });
                            }
                            if( data.hasOwnProperty('ATT.Pitch') ){
                                charts.att_chart.addSeries({
                                    name: 'Actual Pitch'
                                    ,lineWidth: 1
                                    ,data: data['ATT.Pitch']
                                });
                            }
                            if( data.hasOwnProperty('ATT.DesYaw') ){
                                charts.att_chart.addSeries({
                                    name: 'Desired Yaw'
                                    ,lineWidth: 1
                                    ,data: data['ATT.DesYaw']
                                });
                            }
                            if( data.hasOwnProperty('ATT.Yaw') ){
                                charts.att_chart.addSeries({
                                    name: 'Actual Yaw'
                                    ,lineWidth: 1
                                    ,data: data['ATT.Yaw']
                                });
                            }
                        } )
                        .catch( err => {
                            Message.error('Failed to load data: ' + err);
                        } );
                }
                else this.$$('chart:att').hide();

                // Высоты и вертикальное ускорение
                if( msg_tree.exists('CTUN') ){
                    window.app.getService('io').rpc('logGetSeries', {id: log_id, series: ['CTUN.Alt', 'CTUN.DAlt', 'CTUN.BAlt', 'CTUN.DSAlt', 'CTUN.SAlt', 'CTUN.DCRt', 'CTUN.CRt']})
                        .then( data => {
                            if( data.hasOwnProperty('CTUN.Alt') ){
                                charts.alt_chart.addSeries({
                                    name: 'EKF Altitude'
                                    ,lineWidth: 1
                                    ,data: data['CTUN.Alt']
                                });
                            }
                            if( data.hasOwnProperty('CTUN.DAlt') ){
                                charts.alt_chart.addSeries({
                                    name: 'Desired Altitude'
                                    ,lineWidth: 1
                                    ,data: data['CTUN.DAlt']
                                });
                            }
                            if( data.hasOwnProperty('CTUN.BAlt') ){
                                charts.alt_chart.addSeries({
                                    name: 'Baro Altitude'
                                    ,lineWidth: 1
                                    ,data: data['CTUN.BAlt']
                                });
                            }
                            if( data.hasOwnProperty('CTUN.DSAlt') ){
                                charts.alt_chart.addSeries({
                                    name: 'Desired RF Altitude'
                                    ,lineWidth: 1
                                    ,data: data['CTUN.DSAlt']
                                });
                            }
                            if( data.hasOwnProperty('CTUN.SAlt') ){
                                charts.alt_chart.addSeries({
                                    name: 'Sonar/RF Altitude'
                                    ,lineWidth: 1
                                    ,data: data['CTUN.SAlt']
                                });
                            }
                            if( data.hasOwnProperty('CTUN.CRt') ){
                                charts.cr_chart.addSeries({
                                    name: 'Actual rate'
                                    ,lineWidth: 1
                                    ,data: data['CTUN.CRt']
                                });
                            }
                            if( data.hasOwnProperty('CTUN.DCRt') ){
                                charts.cr_chart.addSeries({
                                    name: 'Desired rate'
                                    ,lineWidth: 1
                                    ,data: data['CTUN.DCRt']
                                });
                            }
                        } )
                        .catch( err => {
                            Message.error('Failed to load data: ' + err);
                        } );
                }
                else {
                    this.$$('chart:alt').hide();
                    this.$$('chart:cr').hide();
                }

                // PL
                if( msg_tree.exists('PL') ){
                    window.app.getService('io').rpc('logGetSeries', {id: log_id, series: ['PL.pX', 'PL.pY', 'PL.vX', 'PL.vY', 'PL.Heal', 'PL.TAcq']})
                        .then( data => {
                            if( data.hasOwnProperty('PL.pX') ){
                                charts.pl_chart.addSeries({
                                    name: 'X position'
                                    ,lineWidth: 1
                                    ,data: data['PL.pX']
                                    ,yAxis: 0
                                });
                            }
                            if( data.hasOwnProperty('PL.pY') ){
                                charts.pl_chart.addSeries({
                                    name: 'Y position'
                                    ,lineWidth: 1
                                    ,data: data['PL.pY']
                                    ,yAxis: 0
                                });
                            }
                            if( data.hasOwnProperty('PL.vX') ){
                                charts.pl_chart.addSeries({
                                    name: 'X velocity'
                                    ,lineWidth: 1
                                    ,data: data['PL.vX']
                                    ,yAxis: 0
                                });
                            }
                            if( data.hasOwnProperty('PL.vY') ){
                                charts.pl_chart.addSeries({
                                    name: 'Y velocity'
                                    ,lineWidth: 1
                                    ,data: data['PL.vY']
                                    ,yAxis: 0
                                });
                            }
                            if( data.hasOwnProperty('PL.Heal') ){
                                charts.pl_chart.addSeries({
                                    name: 'Sensor health'
                                    ,lineWidth: 2
                                    ,data: data['PL.Heal']
                                    ,yAxis: 1
                                });
                            }
                            if( data.hasOwnProperty('PL.TAcq') ){
                                charts.pl_chart.addSeries({
                                    name: 'Target acquired'
                                    ,lineWidth: 3
                                    ,data: data['PL.TAcq']
                                    ,yAxis: 1
                                });
                            }
                        } )
                        .catch( err => {
                            Message.error('Failed to load data: ' + err);
                        } );
                }
                else this.$$('chart:pl').hide();

                // OF
                if( msg_tree.exists('OF') ){
                    window.app.getService('io').rpc('logGetSeries', {id: log_id, series: ['OF.flowX', 'OF.flowY', 'OF.bodyX', 'OF.bodyY', 'OF.Qual']})
                        .then( data => {
                            if( data.hasOwnProperty('OF.flowX') ){
                                charts.of_chart.addSeries({
                                    name: 'Flow X'
                                    ,lineWidth: 1
                                    ,data: data['OF.flowX']
                                    ,yAxis: 0
                                });
                            }
                            if( data.hasOwnProperty('OF.flowY') ){
                                charts.of_chart.addSeries({
                                    name: 'Flow Y'
                                    ,lineWidth: 1
                                    ,data: data['OF.flowY']
                                    ,yAxis: 0
                                });
                            }
                            if( data.hasOwnProperty('OF.bodyX') ){
                                charts.of_chart.addSeries({
                                    name: 'Body X'
                                    ,lineWidth: 1
                                    ,data: data['OF.bodyX']
                                    ,yAxis: 0
                                });
                            }
                            if( data.hasOwnProperty('OF.bodyY') ){
                                charts.of_chart.addSeries({
                                    name: 'Body Y'
                                    ,lineWidth: 1
                                    ,data: data['OF.bodyY']
                                    ,yAxis: 0
                                });
                            }
                            if( data.hasOwnProperty('OF.Qual') ){
                                charts.of_chart.addSeries({
                                    name: 'Quality'
                                    ,lineWidth: 1
                                    ,data: data['OF.Qual']
                                    ,yAxis: 1
                                });
                            }

                        } )
                        .catch( err => {
                            Message.error('Failed to load data: ' + err);
                        } );
                }
                else this.$$('chart:of').hide();

                //
                // Ошибки на графиках
                if( data.errors && data.errors.length ) errors_timeline = data.errors;

                // Подготовка набора цветов для отображения полетных режимов
                if( data.modes && data.modes.length ) {
                    modes_timeline = data.modes;

                    modes_timeline.forEach( mode => {
                        if( !modes_colors.hasOwnProperty(mode.num) ) modes_colors[mode.num] = mode_random_colors_set[Math.floor(Math.random() * mode_random_colors_set.length)];
                    });
                }

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
                                            console.log(data);
                                            return '<div style="padding: 10px">Type: ' + (data.type || '') + '</div>'
                                                   + '<div style="padding: 10px">Log time: ' + (data.l_time || '') + '</div>'
                                                   + '<div style="padding: 10px">GPS time: ' + (data.gps_time ? webix.Date.dateToStr('%Y-%m-%d %H:%i')(new Date(data.gps_time)) : '') + '</div>'
                                                   + '<div style="padding: 10px">Location: ' + (data.location || '') + '</div>'
                                                   + '<div style="padding: 10px">Latitude: ' + (data.lat || '') + ', Longitude: ' + (data.lon || '') + '</div>'
                                        }
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
            ,{ localId: 'chart:vibe_xyz', template: '<div id="log_vibe_xyz_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // Вибрация Clip 0-2
            ,{ localId: 'chart:vibe_clip', template: '<div id="log_vibe_clip_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // ATT
            ,{ localId: 'chart:att', template: '<div id="log_att_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // Высоты
            ,{ localId: 'chart:alt', template: '<div id="log_alt_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // Climb Rate
            ,{ localId: 'chart:cr', template: '<div id="log_cr_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // Precision Landing
            ,{ localId: 'chart:pl', template: '<div id="log_pl_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // Oprical Flow
            ,{ localId: 'chart:of', template: '<div id="log_of_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true }
            ,{ height: 30, borderless: true  }

            // Custom chart
            ,{
                cols: [

                    { template: '<div id="custom_chart" style="width:100%; height:400px;"></div>', height: 400, borderless: true, gravity: 3}

                    ,{
                        gravity: 1
                        ,rows: [
                            { view: 'toolbar', borderless: true, elements:[{ view: 'button', label: 'Uncheck all', type: 'iconButton', icon: 'mdi mdi-cancel', localId: 'btn:uncheck_all'},{}]}
                            ,{
                                gravity: 1
                                ,view: 'tree'
                                ,localId: 'tree:msg'
                                ,borderless: true
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
