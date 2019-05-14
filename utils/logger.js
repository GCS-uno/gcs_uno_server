"use strict";

const winston = require('winston');
//const LoggingWinston = require('@google-cloud/logging-winston').LoggingWinston;

const WinstonLogger = function(prefix){
    return winston.createLogger({
        level: 'debug', // log at 'info' and above
        transports: [
            // Log to the console
            new winston.transports.Console({ format: winston.format.simple() })
            // And log to Stackdriver Logging
            //,new LoggingWinston({ prefix: prefix })
        ]
    });
};

const Logger = WinstonLogger('gcs.uno-server');

module.exports = Logger;

