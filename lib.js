
import { getConnection } from './connection.js';
import PubSub from 'simple-pubsub';

function findUrl() {
    let protocol = window.location.protocol === "https:" ? "wss" : "ws";
    let host = window.location.host;
    return `${protocol}://${host}/websocket`
}


export class DVOTC {
    constructor ({ url, key, secret}) {
        this.url = url || findUrl()
        this.key = key;
        this.secret = secret;
        this._requestId = 10;
        this._levelPublisher = new PubSub();
        this._connectionPromises = new Array();
        this._websocketConnected = false;
        this._initialize();
    }

    _getRequestID () {
        let generatedRequest = (this._requestId++).toString();
        return generatedRequest;
    }

    async _initialize() {
        
        this._conn = getConnection(this.url, { key : this.key, secret: this.secret })

        this._connectedPromise = new Promise((resolve, reject)=> {
            this._conn.onopen = () => {
                console.log("Connected ..");
                this._websocketConnected = true;
                this._connectionPromises.forEach(({resolve, reject})=> {
                    resolve(true);
                });
                let levelSubscriptions = this._levelPublisher.status();
                this._subscribeSubscriptions(levelSubscriptions, 'levels')
                this._subscribeOrderUpdates();
                resolve();
            };
        });

        this._conn.on('levels', (topic, data) =>{
            this._levelPublisher.publish(topic, data);
        });

        this._conn.on('order-updates', (topic, data) =>{
            console.log("Received order updates ", topic, data)
        });

        this._conn.on('batch-updates', (topic, data) =>{
            console.log("Received order updates ", topic, data)
        });

        this._conn.on('ping-pong', (topic, data) =>{
            console.log("Ping-Pong message received");
        });

        this._levelPublisher.on('entry',  (topic) => {
            this._subscribeLevelsServer(topic);
        });
        
        this._levelPublisher.on('empty',  (topic) => {
            this._unSubscribeLevelsServer(topic);
        });

        await this._connectedPromise;
        console.log("Ready");
        setInterval(this._sendPing.bind(this), 5000);
    }

    _sendPing() {
        this._conn.sendMessage({
            type: "ping-pong",
            event: Date.now(),
            topic : Date.now(),
            data: Date.now()
        });
    }

    _subscribeOrderUpdates(topic="#") {
        this._conn.sendMessage({
            type: "subscribe",
            event: "order-updates",
            topic : `order/${topic}`,
        });
        console.log(`subscribed order updates for ${topic}`);
    }

    
    _subscribeLevelsServer(topic) {
        this._conn.sendMessage({
            type: "subscribe",
            event: "levels",
            topic : topic,
        });
        console.log(`subscribed levels for ${topic}`);
    };
    
    _unSubscribeLevelsServer(topic) {
        this._conn.sendMessage({
            type: "unsubscribe",
            event: "levels",
            topic
        });
        console.log(`unsubscribed levels for ${topic}`);
    };

    _subscribeSubscriptions(subscriptions, type) {
        for (let topic in subscriptions) {
            if(subscriptions[topic] > 0) {
                switch (type) {
                    case "levels":
                        this._subscribeLevelsServer(topic);
                        break;
                }
            }
        }
    }

    //All public api below
    
    sessionCreated() {
        if(this._websocketConnected){
            return Promise.resolve(true);
        } else {
            return new Promise((resolve, reject)=> {
                this._connectionPromises.push({
                    resolve, reject
                })
            });
        }
    }

    subscribeLevels(topic, callback) {
        return this._levelPublisher.subscribe(topic, callback).toString();
    }
    
    unSubscribeLevels (subscriptionId) {
        this._levelPublisher.unsubscribe(subscriptionId);
        return true;
    };

    sendPromise(message) {
        return new Promise((resolve, reject)=> {
            this._conn.sendMessage(message, function(type,topic,data) {
                if(type == 'error') {
                    return reject(new Error(`${data.code} - ${data.message}`));
                }
                resolve(data);
            });
        });
    }

    async sendRequest ({ topic, data }) {
        var requestId = this._getRequestID();
        var req = {
            type : 'request',
            topic: topic,
            event: requestId,
            data
        };
        return this.sendPromise(req);
    }
    
    async getAvailableSymbols() {
        var requestId = this._getRequestID();
        let message = {
            type : 'request-response',
            topic : `availablesymbols`,
            event : requestId
        }
        return this.sendPromise(message);
    }

    async placeOrder(data) {
        var requestId = this._getRequestID();
        var message = {
            type: "request-response",
            event: data.quoteId+requestId,
            topic: "createorder",
            data
        }
        return this.sendPromise(message);
    }

    async cancelOrder(orderId) {
        var requestId = this._getRequestID();
        var message = {
            type: "request-response",
            event: requestId,
            topic: `cancelorder/${orderId}`,
            data : {}
        }
        return this.sendPromise(message);
    }
    
}

// export default new DVOTC();