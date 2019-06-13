/*
 TODO Реализовать MAVLink 2 с подписями
 */


const _ = require('lodash')
     ,EventEmitter = require('events')
     ,jspack = require("jspack").jspack;


// Загрузка определений для MAVLink V1 и V2 (скомпилированы с помощью mav_gen)
const MAV_DEF_V1 = require('./mavgen_js/v1/ardupilotmega');
const MAV_DEF_V2 = require('./mavgen_js/v2/ardupilotmega');

// Переопределение функции упаковки заголовка для V2
MAV_DEF_V2.header.prototype.pack = function() {

    const magic_byte = Buffer.from([253]),
          mlen = Buffer.from([this.mlen]),
          inc_flags = Buffer.from([0]),
          cmp_flags = Buffer.from([0]),
          seq = Buffer.from([this.seq]),
          srcSystem = Buffer.from([this.srcSystem]),
          srcComponent = Buffer.from([this.srcComponent]),
          msgId = Buffer.alloc(3);

    msgId.writeUIntLE(this.msgId, 0, 3);

    return jspack.Pack('BBBBBBBBBB', Buffer.concat([magic_byte, mlen, inc_flags, cmp_flags, seq, srcSystem, srcComponent, msgId]));

};


const mavlink = function(sys_id=0, comp_id=0, gcs_sys_id=255, gcs_cmp_id=0) {

    this.events = new EventEmitter();

    // Какую версию протокола использовать для отправки сообщения
    // (переключается в парсере в зависимости от входящего Heartbeat)
    this.send_protocol_v = 2;

    // По умолчанию оба ID=0, в этом случае декодируются все входящие сообщения
    this.sysid = sys_id;
    this.compid = comp_id;
    this.gcs_sysid = gcs_sys_id;
    this.gcs_compid = gcs_cmp_id;

    //Send message sequence
    this.send_sequence = 0;

    // Счетчик порядковых номеров входящих сообщений
    this.lastSeq = 0;

    // Необработанный хвост
    this.tail = [];

};


// Парсинг сообщений v1
mavlink.prototype.parseV1 = function(message_buffer){

    //
    // Попробовать расшифровать сообщение V1
    try {
        // Декодирование заголовка сообщения
        const payload_length = parseInt(message_buffer[1]),
              seq_number = parseInt(message_buffer[2]),
              sys_id = parseInt(message_buffer[3]),
              comp_id = parseInt(message_buffer[4]),
              msg_id = parseInt(message_buffer[5]);
        // Полезная нагрузка
        let payload = message_buffer.slice(6, payload_length+6);
        // Контрольная сумма
        const checksum = message_buffer.slice(message_buffer.length - 2).readUIntLE(0,2);

        // Если длина сообщения больше, чем полезная нагрузка + заголовок (6) + контр сумма (2)
        if( message_buffer.length !== payload_length+8 ) return this.errorHandler('messageDecodeError: Sign size inconsistency');

        // Дубликат уже обработанного сообщения
        if( seq_number === this.lastSeq ) return true;

        // Проверяем есть ли обработчик для этого сообщения
        if( !_.has(MAV_DEF_V1.map, msg_id) )  return this.errorHandler('messageDecodeError', `Unknown message id ${msg_id}`);

        // Декодер mav_gen
        const decoder = MAV_DEF_V1.map[msg_id];

        // Создаем буфер для проверки контрольной суммы
        let crc_buf = Buffer.alloc(payload_length+6); // = длина полезной нагрузки + заголовок без первого байта + в конце место 1 байта для crc_extra
        message_buffer.copy(crc_buf,0,1,payload_length+6);

        // Порядковый номер
        if( seq_number > 0 && seq_number-1 !== this.lastSeq ) this.errorHandler('seqError', 'S: ' + seq_number.toString() + ', LS: ' + this.lastSeq); // no return

        // Обновляем счетчик сообщений
        this.lastSeq = seq_number;

        // Добавляем в конец контрольную сумму сообщения crc_extra
        crc_buf[crc_buf.length-1] = decoder.crc_extra;

        // Контрольная сумма не совпала
        if( MAV_DEF_V1.x25Crc(crc_buf) !== checksum ) return this.errorHandler('checksumFail');

        // Проверка System ID и Component ID в сообщении MAVLink
        if( (this.sysid !== 0 && this.compid !== 0) && (sys_id !== this.sysid && comp_id !== this.compid)) return this.errorHandler('autopilotIdError');

        //
        // Расшифровка сообщения
        let t = jspack.Unpack(decoder.format, payload);

        // Reorder the fields to match the order map
        let args = [];
        _.each(t, function(value, key) { args[key] = t[decoder.order_map[key]] });

        // Создание объекта сообщения с расшифрованными полями
        let decoded_message = new decoder.type(args);
        decoded_message.set.call(decoded_message, args);

        if( msg_id === 0 ) this.send_protocol_v = 1;

        // Возврат расшифрованного сообщения
        const result = {
            id: decoded_message.msgID
            ,name: decoded_message.name
            ,fields: {}
            ,v: 1 // mavlink version
        };
        _.map(decoded_message.fieldnames, function(fn){ if( _.has(decoded_message, fn) ) result.fields[fn] = decoded_message[fn];});

        this.events.emit('message', result);
        this.events.emit(result.name, result.fields);
    }

    //
    // Если расшифровка не удалась
    catch(e){
        console.log(e);
        this.errorHandler('messageDecodeError', 'error decoding');
    }
};


// Парсинг сообщений v2
mavlink.prototype.parseV2 = function(message_buffer){

    //
    // Попробовать расшифровать сообщение V1
    try {
        // Декодирование заголовка сообщения
        const payload_length = parseInt(message_buffer[1]),
              incopat_flags = message_buffer[2],
              compat_flags = message_buffer[3],
              seq_number = parseInt(message_buffer[4]),
              sys_id = parseInt(message_buffer[5]),
              comp_id = parseInt(message_buffer[6]),
              msg_id = message_buffer.slice(7,10).readUIntLE(0,3);
        // Полезная нагрузка
        let payload = message_buffer.slice(10, payload_length+10);
        // Контрольная сумма
        const checksum = message_buffer.slice(payload_length+10, payload_length+12).readUIntLE(0,2);
        // Подпись
        let signature = null;

        // Если длина сообщения больше, чем полезная нагрузка + заголовок (10) + контр сумма (2)
        if( message_buffer.length !== payload_length+12 ){
            // То значит должна быть еще и подпись +13 байт
            if( message_buffer.length === payload_length+12+13 ) { // TODO проверить флаг наличия подписи
                signature = message_buffer.slice(payload_length + 12, message_buffer.length);
            }
            // А если не +13, то сообщение неверное
            else return this.errorHandler('messageDecodeError', 'Sign size inconsistency');
        }

        // Дубликат уже обработанного сообщения
        if( seq_number === this.lastSeq ) return true;

        // Проверяем есть ли обработчик для этого сообщения
        if( !_.has(MAV_DEF_V2.map, msg_id) ) return this.errorHandler(`messageDecodeError: Unknown message id ${msg_id}`);

        // Декодер mav_gen
        const decoder = MAV_DEF_V2.map[msg_id];

        // Создаем буфер для проверки контрольной суммы
        let crc_buf = Buffer.alloc(payload_length+10); // = длина полезной нагрузки + заголовок без первого байта + в конце место 1 байта для crc_extra
        message_buffer.copy(crc_buf,0,1,payload_length+10);

        // Порядковый номер
        if( seq_number > 0 && seq_number-1 !== this.lastSeq ) this.errorHandler('seqError', 'S: ' + seq_number.toString() + ', LS: ' + this.lastSeq); // no return


        // Обновляем счетчик сообщений
        this.lastSeq = seq_number;

        // Добавляем в конец контрольную сумму сообщения crc_extra
        crc_buf[crc_buf.length-1] = decoder.crc_extra;

        // Контрольная сумма не совпала
        if( MAV_DEF_V2.x25Crc(crc_buf) !== checksum ) return this.errorHandler('checksumFail');

        // Проверяем необходимую длину сообщения и добиваем до нужной
        // MAVLink 2 убирает в конце все нули
        let spec_msg_length = jspack.CalcLength(decoder.format);
        if( spec_msg_length > payload_length ) payload = Buffer.concat([payload, Buffer.alloc(spec_msg_length-payload_length)]);

        // Проверка System ID и Component ID в сообщении MAVLink
        if( (this.sysid !== 0 && this.compid !== 0) && (sys_id !== this.sysid && comp_id !== this.compid)) return this.errorHandler('autopilotIdError');

        // Расшифровка сообщения
        let t = jspack.Unpack(decoder.format, payload);

        // Reorder the fields to match the order map
        let args = [];
        _.each(t, function(value, key) { args[key] = t[decoder.order_map[key]] });

        // Создание объекта сообщения с расшифрованными полями
        let decoded_message = new decoder.type(args);
        decoded_message.set.call(decoded_message, args);

        // Установка основной версии протокола mavlink
        if( msg_id === 0 ) this.send_protocol_v = 2;

        // Возврат расшифрованного сообщения
        const result = {
             msgID: decoded_message.msgID
            ,name: decoded_message.name
            ,fields: {}
            ,v: 2 // mavlink version
        };
        //console.log(result);
        _.map(decoded_message.fieldnames, function(fn){ if( _.has(decoded_message, fn) ) result.fields[fn] = decoded_message[fn];});

        this.events.emit('message', result);
        this.events.emit(result.name, result.fields);

    }

    //
    // Если расшифровка не удалась
    catch(e){
        console.log(e);
        this.errorHandler('messageDecodeError', 'error decoding');
    }

};

//
// Основная функция вызова парсинга сообщений MAVLink
// returns: [error, decoded_message]
mavlink.prototype.parse = function(message_buffer) {

    const _this = this;

    // Отправляет сообщения и возвращает хвост
    const parse_packet = function(msg){

        // Если пакет mavlink 1
        if( 0xFE === msg[0] ){
            let packet_length = parseInt(msg[1]) + 8;

            // Если длина пакета равна длине сообщения
            if( msg.length === packet_length ){
                // Отправляем сообщение на парсинг целиком
                _this.parseV1(msg);
                // возвращаем пустой хвост
                return [];
            }
            // Если длина пакета больше длины сообщения
            else if( msg.length > packet_length ){
                // выделяем из него сообщение по его длине
                let msg1_frag = msg.slice(0, packet_length);
                // и отрезаем хвост как начало для последующего сообщения
                let tail_frag = msg.slice(packet_length, msg.length);
                // отправляем отрезанное сообщение на парсинг
                _this.parseV1(msg1_frag);
                // прогоняем хвост еще раз, если он начинается с нужного байта
                if( 0xFE === tail_frag[0] || 0xFD === tail_frag[0] ) return parse_packet(tail_frag);
                else return [];
            }
            // Если длина пакета меньше длины сообщения, возвращаем хвост как начало следующего
            else {
                return msg;
            }
        }

        // Если пакет mavlink 2
        else if( 0xFD === msg[0] ){
            let packet_length = parseInt(msg[1]) + 12;

            // Если длина пакета равна длине сообщения
            if( msg.length === packet_length ){
                // Отправляем сообщение на парсинг целиком
                _this.parseV2(msg);
                // возвращаем пустой хвост
                return [];
            }
            // Если длина пакета больше длины сообщения
            else if( msg.length > packet_length ){
                // выделяем из него сообщение по его длине
                let msg1_frag = msg.slice(0, packet_length);
                // и отрезаем хвост как начало для последующего сообщения
                let tail_frag = msg.slice(packet_length, msg.length);
                // отправляем отрезанное сообщение на парсинг
                _this.parseV2(msg1_frag);
                // прогоняем хвост еще раз, если он начинается с нужного байта
                if( 0xFE === tail_frag[0] || 0xFD === tail_frag[0] ) return parse_packet(tail_frag);
                else return [];
            }
            // Если длина пакета меньше длины сообщения, возвращаем хвост как начало следующего
            else {
                return msg;
            }
        }

    };


    if( _this.tail.length ){
        _this.tail = parse_packet(Buffer.concat([_this.tail, message_buffer]));
    }
    else {

        // Если пакет начинается как mavlink 1 или 2
        if( 0xFE === message_buffer[0] || 0xFD === message_buffer[0] ){
            _this.tail = parse_packet(message_buffer);
        }
        // Иначе может быть продолжение предыдущего сообщения
        else {
            _this.errorHandler('brokenPacket', message_buffer.toString('hex'));
        }
    }




};

//
// Функция создания сообщения
mavlink.prototype.createMessage = function(msg_name, fields, callback) {

    const msg_def_id = 'MAVLINK_MSG_ID_' + msg_name;
    let mav = null;

    if( !callback ) callback = function(){};

    this.send_sequence += 1;
    if( this.send_sequence > 255 ) this.send_sequence = 0;

    // Если уже получены сообщения в V1, то исходящие тоже сделать в V1
    if( this.send_protocol_v === 2 ) mav = MAV_DEF_V2;
    else if( this.send_protocol_v === 1 ) mav = MAV_DEF_V1;
    // По умолчанию V2
    else mav = MAV_DEF_V2;


    try {

        // проверить наличие сообщения и обработчика для него
        if( _.has(mav, msg_def_id) && _.has(mav.map, mav[msg_def_id]) ) {
            let msg = new mav.map[mav[msg_def_id]].type();

            // Присвоим поля сообщения объекту
            _.mapKeys(fields, function(value, key) { msg[key] = value });

            let message_buffer = Buffer.from(msg.pack({seq: this.send_sequence, srcSystem: this.gcs_sysid, srcComponent: this.gcs_compid}));

            callback(null, message_buffer);
        }

        else {
            callback(`createMessageError: Undefined message ID ${msg_name}`, null);
        }
    }

    catch( e ){
        callback('createMessageError', null);
    }

};

mavlink.prototype.sendMessage = function(msg_name, fields){
    //console.log('send', fields);
    this.createMessage(msg_name, fields, this.sender);
};

mavlink.prototype.on = function(event, handler){
    this.events.on(event, handler);
};

//
mavlink.prototype.sender = function(err, message_buffer){console.log('define mavlink.sender')};

// Error handler
mavlink.prototype.errorHandler = function(err, err_msg){console.log('MAVLink error', err, err_msg)}; // default error handler


module.exports = mavlink;
