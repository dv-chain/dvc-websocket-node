import ReconnectingWebSocket from './ReconnectingWebsocket.js';

export function getConnection(url, { key, secret }={}) {
    var messageHandlers = new Map();
    var conn = new ReconnectingWebSocket(url, null, { key, secret,  reconnectDecay : 1.1 });

    //listener for event type for example on('price') during a type='subscribe' or on('pong') during a type ping
    conn.on  = function(key, handler) {
        messageHandlers.set(key, handler);
    }

    conn.onmessage = function (data) {
        handleMessage(data)
        // {"type": "request", "topic" : "", "data": "", event: " "}
        //type = request, subscription
    };

    conn.onclose = function (evt) {
        console.log("Closed socket ", evt);
    };

    function handleMessage(msg) {
        var message = JSON.parse(msg);
        var handlerReference = message.event;
        switch(message.type) {
            case "subscribe":
                handlerReference=message.event;
                messageHandlers.get(handlerReference)(message.topic, message.data);
                return;
        }
        var handler = messageHandlers.get(handlerReference)
        var topic = message.topic;
        if(handler && typeof handler == "function") {
            if(message.type == "request-response" || message.type == "error") {
                handler.call(conn, message.type, topic, message.data);
                messageHandlers.delete(message.event);
                return;
            }
            handler.call(conn, message.type, topic, message.data);
        }
    }

    conn.sendMessage = function (message, callback) {
        let { type, topic, data, event } = message
        if(callback && (typeof callback == "function")) {
            if(type === "request-response") {
                if(!message.event) {
                    console.warn("No request id for message type request")
                }
                var sequence = message.event;
                messageHandlers.set(sequence, callback);
            } else {
                console.warn("Ignoring callback received for non req res message");
            }
        }
        conn.send(JSON.stringify(message));
    };
    return conn;
};
