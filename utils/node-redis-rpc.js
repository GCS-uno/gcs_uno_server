"use strict";

/*  Как использовать

RPC.req('RPC_method:1', {drone_id: '2323', port: 23 })
    .then(function(data){
        console.log('Back data', data);
    })
    .catch(console.log);

RPC.on('RPC_method:*', function(data, channel, response_callback){
    console.log('Data', data);
    console.log('Chan', channel);
    response_callback(null, {test: 'data'});
});

 */

const NRP = require('node-redis-pubsub')
     ,nodeUuid = require('node-uuid');


function RedisRPC () { NRP.apply(this, arguments); }
RedisRPC.prototype = NRP.prototype;
RedisRPC.prototype._on = RedisRPC.prototype.on;


/**
 * Make RPC request
 *
 * @param {String} channel Channel on which to emit the message
 * @param {Object} message
 * @param {Integer} timeout
 */
RedisRPC.prototype.req = function (channel, message, timeout=5000) {

    const self = this;
    const uuid = nodeUuid.v4();

    message.__type = 'rpc';
    message.__backChannel = uuid;
    channel = 'rpc_' + channel;

    return new Promise(function(resolve, reject){
        let removeListener = function(){};

        let timeout_reject = setTimeout(function(){
            removeListener();
            reject('timeout');
        }, timeout);


        removeListener = self._on(uuid, function (response) {
            response.err ? reject(response.err) : resolve(response.result);

            clearTimeout(timeout_reject);
            removeListener();
        });

        self.emit(channel, message);
    });

};

/**
 * Set RPC method
 *
 * @param {String} channel Channel on which to emit the message
 * @param {Function} handler - обработчик метода, на входе получает (data, channel, response_callback)
 * @param {Function} callback - вызывается после установки метода
 *
 * response_callback должен быть вызван
 *   с ошибкой response_callback(err, null)
 *   или с результатом response_callback(null, result)
 */
RedisRPC.prototype.on = function (channel, handler, callback) {

    const self = this;
    channel = 'rpc_' + channel;

    const wrappedHandler = function (/*message, channel*/) {
        let args = Array.prototype.slice.apply(arguments);
        const message = args[0];

        let rpcCallbackHandler = function () {};

        // Check if event is of type "rpc".
        if ('__type' in message && message.__type === 'rpc') {
            rpcCallbackHandler = function (err, result) {
                self.emit(
                    message.__backChannel,
                    {
                        err: err,
                        result: result
                    }
                );
            };
        }

        // Append our extended rpc callback handler
        args = [].concat(args, [rpcCallbackHandler]);

        // Call original handler with extended args
        handler.apply(null, args);
    };

    // Trigger original method
    this._on(channel, wrappedHandler, callback);

};


module.exports = RedisRPC;
