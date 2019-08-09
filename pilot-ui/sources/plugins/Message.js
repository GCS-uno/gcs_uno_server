let last_error_message = "";
let last_error_msg_timestamp = "";

import helpers from "../../../utils/helpers";


const Message = {

    info: function(message){
        webix.message({
            //type:"dark_message",
            text: message
        });
    }

    ,warning: function(message){
        webix.message({text: message, type: 'warning'});
    }

    ,error: function(message){
        let now = helpers.now();

        // Одинаковые сообщения показываме раз в 10 секунд
        if( message === last_error_message && now-last_error_msg_timestamp < 10 ) return;

        webix.message({text: message, type: 'error'});
        last_error_msg_timestamp = now;
        last_error_message = message;

        console.error(message);
    }

};

export default Message;
