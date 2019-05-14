"use strict";

/*

/// How to use

// Init
const io_rpc = require('./utils/io_rpc');
const RPC = new io_rpc();

// Init test RPC method
const test_rpc_method = function(data, resolve, reject){
    // process data

    // On success
        resolve({response_data}) // return Object
    // On failure
        reject('error mesage') // return String
};

// Set it
RPC.setMethod('test_method', test_rpc_method);


// Run on CLIENT (source/plugins/SocketIoService.js)
socket_io


// Somewhere in socket.io connection
RPC.execute('test_method', data)
    .then( resp_data => {
        response_callback({status: 'success', data: resp_data});
    })
    .catch( err_msg => {
        response_callback({status: 'failed', message: err_msg});
    });

*/

module.exports = function(){

    let Methods = {};

    return {
        execute: function(method, data){ // req.method, req.data
            return new Promise(function(resolve, reject){
                if( Methods.hasOwnProperty(method) ){
                    Methods[method](data, resolve, reject);
                } else {
                    console.log('Method not available: ' + method);
                    reject('Method not available: ' + method)
                }
            });
        }

        ,setMethod: function(method_name, method_func){
            Methods[method_name] = method_func;
        }

    };
};
