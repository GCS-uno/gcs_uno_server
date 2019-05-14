"use strict";

const config = require('./../configs/server_config');

const thinky = require('thinky')({
    host: config.RETHINKDB_SERVER
    ,port: config.RETHINKDB_PORT
    ,db: config.RETHINKDB_DB
});

module.exports = thinky;
