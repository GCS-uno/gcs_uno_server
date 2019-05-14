const Message = {

    info: function(message){
        webix.message(message);
    }

    ,warning: function(message){
        webix.message({text: message, type: 'warning'});
    }

    ,error: function(message){
        webix.message({text: message, type: 'error'});
    }

};

export default Message;