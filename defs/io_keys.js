/*
IO keys mapper
    Usage
        const IK = require('./defs/io_keys')
        IK.DEF_KEY(id)

 */

const _ = require('lodash');

const keys_prefixes = {

    DRONE_IO_ROOM: 'room_drone_' // +ID

};


const set_func = function(prefix){

    return function(id){
        if( !id ) id = '';
        return '' + keys_prefixes[prefix] + id;
    }
};

const io_keys = {};


_.mapKeys(keys_prefixes, function (value, key) {
    io_keys[key] = set_func(key);
});



module.exports = io_keys;
