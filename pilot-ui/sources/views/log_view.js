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

        top_controls_id = webix.$$('top_view_controls').addView(view_controls);

    }

    ready(view, url){

        // drone_id передается в параметре открытия вида
        const log_id = this.getParam("id");

        // Если параметра нет или он не найден в коллекции
        // Открыть список
        if( !log_id || !LogsCollection.getItem(log_id) ){
            this.app.show('/app/logs_list');
            return;
        }

        const log_item = LogsCollection.getItem(log_id);

        // Сделать в заголовке ссылку на список и добавить название дрона
        this.app.getService('topTitle').update([{text: 'Logs', link: '/app/logs_list'}, {text: log_item.name}]);

        const map = this.$$('map:drone');
        const list_errs = this.$$('list:errors');
        const list_msgs = this.$$('list:messages');
        const list_events = this.$$('list:events');

        // Создание вида после загрузки карты
        map.getMap(true).then(function(mapObj) {
            // Установка параметров карты
            mapObj.setOptions(map_options);
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
                /*
                ,plotBands: [
                    { // Green
                        from: 0,
                        to: 5,
                        color: 'rgba(46,211,15,0.52)',
                        label: {
                            text: 'Good',
                            style: {
                                color: '#606060'
                            }
                        }
                    }
                    ,{ // Yellow
                        from: 5,
                        to: 10,
                        color: 'rgba(255,188,56,0.52)',
                        label: {
                            text: 'Check',
                            style: {
                                color: '#606060'
                            }
                        }
                    }
                    ,{ // Red
                        from: 10,
                        to: 100,
                        color: 'rgba(255,47,49,0.52)',
                        label: {
                            text: 'Danger',
                            style: {
                                color: '#606060'
                            }
                        }
                    }
                ]

                 */
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
                text: 'Altitudes'
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
                text: 'Climb rate'
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




        LogsCollection.Get(log_id)
            .then( data => {
                console.log('Log data', data);

                list_errs.parse(data.log_data.ERR);
                list_msgs.parse(data.log_data.MSG);
                list_events.parse(data.log_data.EV);


                // Положение ATT
                if( data.log_data.ATT ){
                    att_chart.addSeries({
                        name: 'Des Roll'
                        ,lineWidth: 1
                        ,data: data.log_data.ATT.DesRoll
                    });
                    att_chart.addSeries({
                        name: 'Roll'
                        ,lineWidth: 1
                        ,data: data.log_data.ATT.Roll
                    });
                    att_chart.addSeries({
                        name: 'Des pitch'
                        ,lineWidth: 1
                        ,data: data.log_data.ATT.DesPitch
                    });
                    att_chart.addSeries({
                        name: 'Pitch'
                        ,lineWidth: 1
                        ,data: data.log_data.ATT.Pitch
                    });
                    att_chart.addSeries({
                        name: 'Des yaw'
                        ,lineWidth: 1
                        ,data: data.log_data.ATT.DesYaw
                    });
                    att_chart.addSeries({
                        name: 'Yaw'
                        ,lineWidth: 1
                        ,data: data.log_data.ATT.Yaw
                    });
                }

                // Вибрация
                if( data.log_data.VIBE ){
                    if( data.log_data.VIBE.hasOwnProperty('VibeX') ){
                        vibe_xyz_chart.addSeries({
                            name: 'X'
                            ,lineWidth: 1
                            ,data: data.log_data.VIBE.VibeX
                            ,color: '#0f0eff'
                        });
                    }
                    if( data.log_data.VIBE.hasOwnProperty('VibeY') ){
                        vibe_xyz_chart.addSeries({
                            name: 'Y'
                            ,lineWidth: 1
                            ,data: data.log_data.VIBE.VibeY
                            ,color: '#ff291c'
                        });
                    }
                    if( data.log_data.VIBE.hasOwnProperty('VibeZ') ){
                        vibe_xyz_chart.addSeries({
                            name: 'Z'
                            ,lineWidth: 1
                            ,data: data.log_data.VIBE.VibeZ
                            ,color: '#c500ff'
                        });
                    }

                    if( data.log_data.VIBE.hasOwnProperty('Clip0') ){
                        vibe_clip_chart.addSeries({
                            name: 'Clip 0'
                            ,lineWidth: 2
                            ,data: data.log_data.VIBE.Clip0
                        });
                    }
                    if( data.log_data.VIBE.hasOwnProperty('Clip1') ){
                        vibe_clip_chart.addSeries({
                            name: 'Clip 1'
                            ,lineWidth: 2
                            ,data: data.log_data.VIBE.Clip1
                        });
                    }
                    if( data.log_data.VIBE.hasOwnProperty('Clip2') ){
                        vibe_clip_chart.addSeries({
                            name: 'Clip 2'
                            ,lineWidth: 2
                            ,data: data.log_data.VIBE.Clip2
                        });
                    }
                }

                // Высоты и вертикальное ускорение
                if( data.log_data.CTUN ){
                    if( data.log_data.CTUN.hasOwnProperty('Alt') ){
                        alt_chart.addSeries({
                            name: 'EKF Altitude'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['Alt']
                        });
                    }
                    if( data.log_data.CTUN.hasOwnProperty('DAlt') ){
                        alt_chart.addSeries({
                            name: 'Desired Altitude'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['DAlt']
                        });
                    }
                    if( data.log_data.CTUN.hasOwnProperty('BAlt') ){
                        alt_chart.addSeries({
                            name: 'Baro Altitude'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['BAlt']
                        });
                    }
                    if( data.log_data.CTUN.hasOwnProperty('DSAlt') ){
                        alt_chart.addSeries({
                            name: 'Desired RF Altitude'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['DSAlt']
                        });
                    }
                    if( data.log_data.CTUN.hasOwnProperty('SAlt') ){
                        alt_chart.addSeries({
                            name: 'RF Altitude'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['SAlt']
                        });
                    }

                    if( data.log_data.CTUN.hasOwnProperty('CRt') ){
                        cr_chart.addSeries({
                            name: 'Actual rate'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['CRt']
                        });
                    }
                    if( data.log_data.CTUN.hasOwnProperty('DCRt') ){
                        cr_chart.addSeries({
                            name: 'Desired rate'
                            ,lineWidth: 1
                            ,data: data.log_data.CTUN['DCRt']
                        });
                    }
                }

                // PL
                if( data.log_data.PL ){
                    pl_chart.addSeries({
                        name: 'X position'
                        ,lineWidth: 1
                        ,data: data.log_data.PL['pX']
                        ,yAxis: 0
                    });
                    pl_chart.addSeries({
                        name: 'Y position'
                        ,lineWidth: 1
                        ,data: data.log_data.PL['pY']
                        ,yAxis: 0
                    });
                    pl_chart.addSeries({
                        name: 'X velocity'
                        ,lineWidth: 1
                        ,data: data.log_data.PL['vX']
                        ,yAxis: 0
                    });
                    pl_chart.addSeries({
                        name: 'Y velocity'
                        ,lineWidth: 1
                        ,data: data.log_data.PL['vY']
                        ,yAxis: 0
                    });
                    pl_chart.addSeries({
                        name: 'Sensor health'
                        ,lineWidth: 2
                        ,data: data.log_data.PL['Heal']
                        ,yAxis: 1
                    });
                    pl_chart.addSeries({
                        name: 'Target acquired'
                        ,lineWidth: 3
                        ,data: data.log_data.PL['TAcq']
                        ,yAxis: 1
                    });
                }

                // OF
                if( data.log_data.OF ){
                    of_chart.addSeries({
                        name: 'Flow X'
                        ,lineWidth: 1
                        ,data: data.log_data.OF['flowX']
                        ,yAxis: 0
                    });
                    of_chart.addSeries({
                        name: 'Flow Y'
                        ,lineWidth: 1
                        ,data: data.log_data.OF['flowY']
                        ,yAxis: 0
                    });
                    of_chart.addSeries({
                        name: 'Body X'
                        ,lineWidth: 1
                        ,data: data.log_data.OF['bodyX']
                        ,yAxis: 0
                    });
                    of_chart.addSeries({
                        name: 'Body Y'
                        ,lineWidth: 1
                        ,data: data.log_data.OF['bodyX']
                        ,yAxis: 0
                    });
                    of_chart.addSeries({
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


                // Отрисовка ошибок на графике положения
                data.log_data.ERR.forEach( el => {
                    att_chart.xAxis[0].addPlotLine({
                        color: 'red'
                        ,dashStyle: 'Dash'
                        ,value: el.t
                        ,width: 2
                        ,label: {
                            text: el.msg
                        }
                    });
                });

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
const view_controls = {
    cols: [

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
    view:"google-map",
    localId: "map:drone",
    zoom: 10,
    mapType: 'SATELLITE',
    center:[ 55, 37 ]
    ,height: 400
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
            {
                template: 'Some info about log'
                ,height: 100
                ,borderless: true
            }
            ,{ height: 30, borderless: true  }

            ,map_config
            ,{ height: 30, borderless: true  }

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

            // Ошибки и сообщения
            ,{
                height: 400
                ,cols: [
                    {
                        rows: [
                            { view: 'template', template: 'Errors', type: 'header' }
                            ,{ view: 'list', localId: 'list:errors', template: function(row){
                                    return helpers.readable_seconds(Math.round(row.t/100)) + ' ' + row.msg;
                                } }
                        ]
                    }
                    ,{
                        rows: [
                            { view: 'template', template: 'Messages', type: 'header' }
                            ,{ view: 'list', localId: 'list:messages', template: function(row){
                                    return helpers.readable_seconds(row.t) + ' ' + row.msg;
                                } }
                        ]
                    }
                    ,{
                        rows: [
                            { view: 'template', template: 'Events', type: 'header' }
                            ,{ view: 'list', localId: 'list:events', template: function(row){
                                    return helpers.readable_seconds(row.t) + ' ' + row.ev;
                                } }
                        ]
                    }

                ]
            }

            ,{height: 100, borderless: true }

        ]
    }
};
