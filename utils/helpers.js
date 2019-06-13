"use strict";

/*

    Вспомогательные функции
    !!! Испоьзуются и на клиенте и на сервере !!!

 */
const helpers = {

    /*  utils/timeformat2  */
    // Секунды в строку ЧЧ:ММ:СС
    readable_seconds: function(seconds){
        let h = Math.floor( seconds/3600 );
        let m = '0' + Math.floor( (seconds - h*3600)/60 );
        let s = '0' + (seconds - h*3600 - m*60);

        return h + ':' + m.substr(-2) + ':' + s.substr(-2);
    }

    ,readable_bytes: function(num_of_bytes=0){
        if( num_of_bytes >= 100*1048576 ){ // >= 100 MB
            return Math.round(num_of_bytes/1048576) + ' MB'; // 102 MB
        }
        if( num_of_bytes >= 1048576 ){ // >= 1 MB
            return (num_of_bytes/1048576).toFixed(1) + ' MB'; // 5.6 MB
        }
        if( num_of_bytes >= 102400 ){ // >= 100 KB
            return Math.round(num_of_bytes/1024) + ' KB'; // 101 KB
        }
        if( num_of_bytes >= 1024 ){ // >= 1 KB
            return (num_of_bytes/1024).toFixed(1) + ' KB'; // 1.1 KB
        }

        return num_of_bytes + ' B'; // 100 B
    }

    /*  utils/timeformat1  */
    // Делает читаемое время из обычного timestamp
    ,timeFormat2: function(timestamp){
        let date = new Date(timestamp);
        let hours = date.getHours();
        let minutes = "0" + date.getMinutes();
        let seconds = "0" + date.getSeconds();
        return hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
    }

    // Отметка в округленных секундах
    ,now: function(){
        return Math.round((new Date()).getTime()/1000)
    }

    // Отметка в миллисекундах
    ,now_ms: function(){
        return (new Date()).getTime();
    }

    // Создание произвольной строки с заданной длиной
    ,random_string: function(length) {
        let text = "";
        let possible = "abcdefghijklmnopqrstuvwxyz0123456789";

        for ( let i = 0; i < length; i++ )
            text += possible.charAt(Math.floor(Math.random() * possible.length));

        return text;
    }

    ,isNil: function(value){
        return value === undefined || value === null;
    }

};


module.exports = helpers;
