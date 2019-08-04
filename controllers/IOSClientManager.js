const
    server_config = require('../configs/server_config'),
    _ = require('lodash')
;

const IOSClientManager = function(){

    // Список ключей с текущими подключениями
    const connections = {};

    return {
        // Проверка валидности ключа и двойного подключения
        connect: function(socket){
            // Ключ из настроек iOS приложения
            let authKey = socket.handshake.headers['authkey'];

            return new Promise(function (resolve, reject) {

                // Если с таким ключем уже есть подключение, то это сразу отменяем
                if( _.has(connections, authKey) && connections[authKey] ) return reject('key_in_use');

                if( !_.includes(server_config.DJI_KEYS, authKey) ) return reject('key_invalid');

                // Ключ есть, создаем подключение
                connections[authKey] = true;

                socket.on("error", err => {
                    console.log('iOS socket error', err);
                    socket.disconnect();
                });

                // При отключении сокета, убираем ключ из списка и обновляем срок жизни на 3 часа
                socket.on('disconnect', reason => { // reason
                    console.log("iOS app disconnected", reason);
                    connections[authKey] = null;
                    _.unset(connections, authKey);
                });

                return resolve(authKey);

            });
        }
    };
}();

module.exports = IOSClientManager;
