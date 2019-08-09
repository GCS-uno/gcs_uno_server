/*

let socket = app.getService('io');

// Соединение делается один раз
socket.connect({query options});

// RPC
socket.rpc('methodDoWork', {data obj}, response(result){});
response({status:'failed', message:'Failed'})
response({status:'success', data: {}})

// Emit
socket.emit(event, data) => возвращает True если есть соединение с сервером и сообщение отправлено
                            или False, если соединения нет и сообщение не отправлено

*/

import io from 'socket.io-client';
import Message from './Message';
import Cookies from "js-cookie";



export default function SocketIoService(app){

    let socket = null;
    let deffered_rpc_requests = [];

    const send_deffered_rpc = function(){
        if( !deffered_rpc_requests.length ) return;

        let next_req = deffered_rpc_requests.shift();
        service.rpc(next_req.method, next_req.data, true, next_req.callback);
    };

    const service = {

        //
        connect(options={}){
            let wcid = Cookies.get('wcid') || "";

            options.transportOptions = {
                polling: {
                    extraHeaders: {
                        'x-io-client': 'webapp',
                        'wcid': wcid
                    }
                }
            };

            socket = io(options);

            return new Promise(function(resolve, reject){
                // Socket.io internal events
                socket.on('connect', () => {
                    Message.info('Connected to server');
                    //console.log('socket connected');
                    send_deffered_rpc();
                    resolve();
                });

                socket.on('disconnect', (reason) => {
                    Message.error('No connection to server');
                    //console.log('socket disconnected: ' + reason);
                    reject('io error');
                });

                //socket.on('reconnect', (num) => {
                    //console.log('socket reconnected, try ' + num);
                //});

                //socket.on('reconnect_attempt', (num) => {
                    //console.log('socket reconnect attempt ' + num);
                //});

                //socket.on('reconnecting', (num) => {
                //    console.log('socket reconnecting ' + num);
                //});

                //socket.on('reconnect_failed', () => {
                //    console.log('socket reconnect failed');
                //});

                socket.on('connect_error', (err) => {
                    Message.error('No connection to server');
                    //console.log('socket connect error');
                    //console.log(err);
                    reject('io error');
                });

                socket.on('ping', () => {
                    //console.log('io ping');
                });

                socket.on('pong', (ms) => {
                    //console.log('io pong ' + ms);
                });


                socket.on('connect_timeout', (timeout) => {
                    //console.log('socket connect timeout ' + timeout);
                    reject('io error');
                });

                socket.on('error', (err) => {
                    //console.log('socket error');
                    //console.log(err);
                    reject('io error');
                });

                // Sent from server as confirmation
                socket.on('status', (status) => {
                    //console.log(status);
                });
            });

        },

        //
        emit(event, data, callback){
            if( socket.connected ){
                if( 'function' === typeof callback ) socket.emit(event, data, callback);
                else socket.emit(event, data);
                return true;
            }
            else {
                //console.log('can not emit, socket disconnected');
                return false;
            }
        },

        //
        on(event, handler){
            socket.on(event, handler);
        },

        //
        off(event){
            socket.off(event);
        },

        // RPC
        rpc(method, data, deffered, callback){
            /* Usage
             .then( f(data){...} ).catch( f(msg){} )
             deffered: если флаг установлен, запрос будет передан в очередь на отправку, если сейчас нет соединения
            */

            deffered = !!deffered;

            return new Promise(function (resolve, reject) {
                const rpc_callback = function(){

                    return function(resp){
                        const {status, data, message} = resp;
                        'success' === status ? resolve(data) : reject(message);
                    }
                };

                if( !callback ) callback = rpc_callback();

                if( socket && socket.connected ){
                    socket.emit('__apirpc', { method: method, data: data }, callback);
                    send_deffered_rpc();
                }
                else if( deffered ){
                    deffered_rpc_requests.push({
                        method: method
                        ,data: data
                        ,callback: callback
                    });
                }
                else {
                    reject('No server connection');
                }

            });
        }

    };

    app.setService('io', service);

};
