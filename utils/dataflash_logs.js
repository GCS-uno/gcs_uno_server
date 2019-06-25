"use strict";

const fs = require('fs')
    ,_ = require('lodash')
    ,server_config = require('../configs/server_config');


const googleMapsClient = require('@google/maps').createClient({ key: server_config.GMAPS_API_KEY, Promise: Promise });

const DataFlashLog = {

    grab_data: function(filename){
        return new Promise(function(resolve, reject){
            let response_data = {
                 gps_time: 0
                ,l_time: 0 //
                ,lat: 0
                ,lon: 0
            };

            try {
                fs.readFile('./../logs/' + filename + '.json', (err, file_content) => {
                    if (err) return reject('Failed to init parse file');

                    let log_msgs = JSON.parse(file_content);
                    response_data.size = file_content.length;

                    let m_list = {};
                    let start_time = null;
                    let end_time = 0;

                    // Раскидать сообщения по группам
                    _.each(log_msgs, function(m, ind){
                        if( !_.has(m, 'mavpackettype') ) return;

                        if( !_.has(m_list, m['mavpackettype']) ) m_list[m['mavpackettype']] = [];

                        m_list[m['mavpackettype']].push(m);

                        if( _.has(m, 'TimeUS') ){
                            let timeus = parseInt(m['TimeUS']);
                            if( !start_time ) start_time = timeus;
                            if( timeus > end_time ) end_time = timeus;
                        }
                    });

                    response_data.l_time = Math.round((end_time-start_time)/1000000);

                    // Найти ближайшее GPS сообщение со временем и координатами
                    if( _.has(m_list, 'GPS') ){
                        for( let i = 0, k = m_list['GPS'].length; i < k; i++ ){
                            if( parseInt(m_list['GPS'][i].Status) >= 2 ){
                                response_data.lat = parseFloat(m_list['GPS'][i].Lat).toPrecision(7);
                                response_data.lon = parseFloat(m_list['GPS'][i].Lng).toPrecision(7);
                                response_data.gps_time = 315964800 + 86400*7*parseInt(m_list['GPS'][i].GWk) + parseInt(m_list['GPS'][i].GMS)*0.001; // 315964800 = 86400*(10*365 + Math.round((1980-1969)/4) + 4)
                                break;
                            }
                        }
                    }

                    resolve(response_data);

                });
            }
            catch ( e ){
                reject('Failed to init parse file');
                console.log(e);
            }


        });
    }

    ,location_lookup: function(lat, lon){
        return googleMapsClient.reverseGeocode({ latlng: [lat, lon] }).asPromise();
    }

};

module.exports = DataFlashLog;

