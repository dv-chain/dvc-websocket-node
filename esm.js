import WebSocket from 'ws';
import crypto from 'crypto';
import PubSub from 'simple-pubsub';

function getHeaders({ key, secret }) {
  if(!key && !secret) {
      return '';
  }
  var timestamp = Date.now();
  var timewindow = 20000;
  console.log("KEY used ",key);
  console.log("SECRET used ", secret);
  console.log("Timestamp used ",timestamp);
  console.log("Time window used ", timewindow);
  var message = `${key}${timestamp}${timewindow}`;
  const signatureHash = crypto.createHmac('sha256', secret) 
                    .update(message) 
                    .digest('base64'); 
  console.log("Signature Hash ", signatureHash);
  return {
      "dv-timestamp" : timestamp,
      "dv-timewindow" : timewindow,
      "dv-signature" : signatureHash,
      "dv-api-key" : key
  }
}

/**
 * This behaves like a WebSocket in every way, except if it fails to connect,
 * or it gets disconnected, it will repeatedly poll until it successfully connects
 * again.
 *
 * It is API compatible, so when you have:
 *   ws = new WebSocket('ws://....')
 * you can replace with:
 *   ws = new ReconnectingWebSocket('ws://....')
 *
 * The event stream will typically look like:
 *  onconnecting
 *  onopen
 *  onmessage
 *  onmessage
 *  onclose // lost connection
 *  onconnecting
 *  onopen  // sometime later...
 *  onmessage
 *  onmessage
 *  etc...
 *
 * It is API compatible with the standard WebSocket API, apart from the following members:
 *
 * - `bufferedAmount`
 * - `extensions`
 * - `binaryType`
 *
 * Latest version: https://github.com/joewalnes/reconnecting-websocket/
 * - Joe Walnes
 *
 * Syntax
 * ======
 * var socket = new ReconnectingWebSocket(url, protocols, options)
 *
 * Parameters
 * ==========
 * url - The url you are connecting to.
 * protocols - Optional string or array of protocols.
 * options - See below
 *
 * Options
 * =======
 * Options can either be passed upon instantiation or set after instantiation:
 *
 * var socket = new ReconnectingWebSocket(url, null, { debug: true, reconnectInterval: 4000 })
 *
 * or
 *
 * var socket = new ReconnectingWebSocket(url)
 * socket.debug = true
 * socket.reconnectInterval = 4000
 *
 * debug
 * - Whether this instance should log debug messages. Accepts true or false. Default: false.
 *
 * automaticOpen
 * - Whether or not the websocket should attempt to connect immediately upon instantiation. The socket can be manually opened or closed at any time using ws.open() and ws.close().
 *
 * reconnectInterval
 * - The number of milliseconds to delay before attempting to reconnect. Accepts integer. Default: 1000.
 *
 * maxReconnectInterval
 * - The maximum number of milliseconds to delay a reconnection attempt. Accepts integer. Default: 30000.
 *
 * reconnectDecay
 * - The rate of increase of the reconnect delay. Allows reconnect attempts to back off when problems persist. Accepts integer or float. Default: 1.5.
 *
 * timeoutInterval
 * - The maximum time in milliseconds to wait for a connection to succeed before closing and retrying. Accepts integer. Default: 2000.
 *
 */
function ReconnectingWebSocket (url, protocols, options) {

    this.key = options.key;
    this.secret = options.secret;

    // Default settings
    var settings = {
  
      /** Whether this instance should log debug messages. */
      debug: false,
  
      /** Whether or not the websocket should attempt to connect immediately upon instantiation. */
      automaticOpen: true,
  
      /** The number of milliseconds to delay before attempting to reconnect. */
      reconnectInterval: 1000,
      /** The maximum number of milliseconds to delay a reconnection attempt. */
      maxReconnectInterval: 30000,
      /** The rate of increase of the reconnect delay. Allows reconnect attempts to back off when problems persist. */
      reconnectDecay: 1.5,
  
      /** The maximum time in milliseconds to wait for a connection to succeed before closing and retrying. */
      timeoutInterval: 2000,
  
      /** The maximum number of reconnection attempts to make. Unlimited if null. */
      maxReconnectAttempts: null,
  
      /** The binary type, possible values 'blob' or 'arraybuffer', default 'blob'. */
      binaryType: 'arraybuffer'
    };
    if (!options) { options = {}; }
  
    // Overwrite and define settings with options if they exist.
    for (var key in settings) {
      if (typeof options[key] !== 'undefined') {
        this[key] = options[key];
      } else {
        this[key] = settings[key];
      }
    }
  
    // These should be treated as read-only properties
  
    /** The URL as resolved by the constructor. This is always an absolute URL. Read only. */
    this.url = url;
  
    /** The number of attempted reconnects since starting, or the last successful connection. Read only. */
    this.reconnectAttempts = 0;
  
    /**
     * The current state of the connection.
     * Can be one of: WebSocket.CONNECTING, WebSocket.OPEN, WebSocket.CLOSING, WebSocket.CLOSED
     * Read only.
     */
    this.readyState = WebSocket.CONNECTING;
  
    /**
     * A string indicating the name of the sub-protocol the server selected; this will be one of
     * the strings specified in the protocols parameter when creating the WebSocket object.
     * Read only.
     */
    this.protocol = null;
  
    // Private state variables
  
    var self = this;
    var ws;
    var forcedClose = false;
    var timedOut = false;
  
    // Wire up "on*" properties as event handlers
  
    // eventDispatcher.on('open', function (event) { self.onopen(event); })
    // eventDispatcher.on('close', function (event) { self.onclose(event); })
    // eventDispatcher.on('connecting', function (event) { self.onconnecting(event); })
    // eventDispatcher.on('message', function (event) { self.onmessage(event); })
    // eventDispatcher.on('error', function (event) { self.onerror(event); })
  
    /**
     * This function generates an event that is compatible with standard
     * compliant browsers and IE9 - IE11
     *
     * This will prevent the error:
     * Object doesn't support this action
     *
     * http://stackoverflow.com/questions/19345392/why-arent-my-parameters-getting-passed-through-to-a-dispatched-event/19345563#19345563
     * @param s String The name that the event should use
     * @param args Object an optional object that the event will use
     */
    function generateEvent (s, data) {
      var handler = self["on"+s];
      if(handler && typeof handler == "function") {
        handler.call(ws, data);
      }
    }
  
    this.open = function (reconnectAttempt) {
      ws = new WebSocket(self.url, { headers: getHeaders({key: this.key, secret: this.secret}) } || []);
      ws.binaryType = this.binaryType;
  
      if (reconnectAttempt) {
        if (this.maxReconnectAttempts && this.reconnectAttempts > this.maxReconnectAttempts) {
          return
        }
      } else {
        generateEvent('connecting');
        this.reconnectAttempts = 0;
      }
  
      if (self.debug || ReconnectingWebSocket.debugAll) {
        console.debug('ReconnectingWebSocket', 'attempt-connect', self.url);
      }
  
      var localWs = ws;
      var timeout = setTimeout(function () {
        if (self.debug || ReconnectingWebSocket.debugAll) {
          console.debug('ReconnectingWebSocket', 'connection-timeout', self.url);
        }
        timedOut = true;
        localWs.close();
        timedOut = false;
      }, self.timeoutInterval);
  
      ws.onopen = function (event) {
        clearTimeout(timeout);
        if (self.debug || ReconnectingWebSocket.debugAll) {
          console.debug('ReconnectingWebSocket', 'onopen', self.url);
        }
        self.protocol = ws.protocol;
        self.readyState = WebSocket.OPEN;
        self.reconnectAttempts = 0;
        generateEvent('open');
        reconnectAttempt = false;
      };
  
      ws.onclose = function (event) {
        clearTimeout(timeout);
        ws = null;
        if (forcedClose) {
          self.readyState = WebSocket.CLOSED;
          generateEvent('close');
        } else {
          self.readyState = WebSocket.CONNECTING;
          generateEvent('connecting');
          if (!reconnectAttempt && !timedOut) {
            if (self.debug || ReconnectingWebSocket.debugAll) {
              console.debug('ReconnectingWebSocket', 'onclose', self.url);
            }
            generateEvent('close');
          }
  
          var timeout = self.reconnectInterval * Math.pow(self.reconnectDecay, self.reconnectAttempts);
          setTimeout(function () {
            self.reconnectAttempts++;
            self.open(true);
          }, timeout > self.maxReconnectInterval ? self.maxReconnectInterval : timeout);
        }
      };
      ws.onmessage = function (event) {
        if (self.debug || ReconnectingWebSocket.debugAll) {
          console.debug('ReconnectingWebSocket', 'onmessage', self.url, event.data);
        }
        generateEvent('message', event.data);
      };
      ws.onerror = function (event) {
        if (self.debug || ReconnectingWebSocket.debugAll) {
          console.debug('ReconnectingWebSocket', 'onerror', self.url, event);
        }
        generateEvent('error');
      };
    };
  
    // Whether or not to create a websocket upon instantiation
    if (this.automaticOpen == true) {
      this.open(false);
    }
  
    /**
     * Transmits data to the server over the WebSocket connection.
     *
     * @param data a text string, ArrayBuffer or Blob to send to the server.
     */
    this.send = function (data) {
      if (ws) {
        if (self.debug || ReconnectingWebSocket.debugAll) {
          console.debug('ReconnectingWebSocket', 'send', self.url, data);
        }
        return ws.send(data)
      } else {
        throw 'INVALID_STATE_ERR : Pausing to reconnect websocket'
      }
    };
  
    /**
     * Closes the WebSocket connection or connection attempt, if any.
     * If the connection is already CLOSED, this method does nothing.
     */
    this.close = function (code, reason) {
      // Default CLOSE_NORMAL code
      if (typeof code == 'undefined') {
        code = 1000;
      }
      forcedClose = true;
      if (ws) {
        ws.close(code, reason);
      }
    };
  
    /**
     * Additional public API method to refresh the connection if still open (close, re-open).
     * For example, if the app suspects bad data / missed heart beats, it can try to refresh.
     */
    this.refresh = function () {
      if (ws) {
        ws.close();
      }
    };
  }
  
  /**
   * An event listener to be called when the WebSocket connection's readyState changes to OPEN
   * this indicates that the connection is ready to send and receive data.
   */
  ReconnectingWebSocket.prototype.onopen = function (event) {};
  /** An event listener to be called when the WebSocket connection's readyState changes to CLOSED. */
  ReconnectingWebSocket.prototype.onclose = function (event) {};
  /** An event listener to be called when a connection begins being attempted. */
  ReconnectingWebSocket.prototype.onconnecting = function (event) {};
  /** An event listener to be called when a message is received from the server. */
  ReconnectingWebSocket.prototype.onmessage = function (event) {};
  /** An event listener to be called when an error occurs. */
  ReconnectingWebSocket.prototype.onerror = function (event) {};
  
  /**
   * Whether all instances of ReconnectingWebSocket should log debug messages.
   * Setting this to true is the equivalent of setting all instances of ReconnectingWebSocket.debug to true.
   */
  ReconnectingWebSocket.debugAll = false;
  
  ReconnectingWebSocket.CONNECTING = WebSocket.CONNECTING;
  ReconnectingWebSocket.OPEN = WebSocket.OPEN;
  ReconnectingWebSocket.CLOSING = WebSocket.CLOSING;
  ReconnectingWebSocket.CLOSED = WebSocket.CLOSED;

function getConnection(url, { key, secret }={}) {
    var messageHandlers = new Map();
    var conn = new ReconnectingWebSocket(url, null, { key, secret,  reconnectDecay : 1.1 });

    //listener for event type for example on('price') during a type='subscribe' or on('pong') during a type ping
    conn.on  = function(key, handler) {
        messageHandlers.set(key, handler);
    };

    conn.onmessage = function (data) {
        handleMessage(data);
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
        var handler = messageHandlers.get(handlerReference);
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
        let { type, topic, data, event } = message;
        if(callback && (typeof callback == "function")) {
            if(type === "request-response") {
                if(!message.event) {
                    console.warn("No request id for message type request");
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
}

function findUrl() {
    let protocol = window.location.protocol === "https:" ? "wss" : "ws";
    let host = window.location.host;
    return `${protocol}://${host}/websocket`
}


class DVOTC {
    constructor ({ url, key, secret}) {
        this.url = url || findUrl();
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
        
        this._conn = getConnection(this.url, { key : this.key, secret: this.secret });

        this._connectedPromise = new Promise((resolve, reject)=> {
            this._conn.onopen = () => {
                console.log("Connected ..");
                this._websocketConnected = true;
                this._connectionPromises.forEach(({resolve, reject})=> {
                    resolve(true);
                });
                let levelSubscriptions = this._levelPublisher.status();
                this._subscribeSubscriptions(levelSubscriptions, 'levels');
                this._subscribeOrderUpdates();
                resolve();
            };
        });

        this._conn.on('levels', (topic, data) =>{
            this._levelPublisher.publish(topic, data);
        });

        this._conn.on('order-updates', (topic, data) =>{
            console.log("Received order updates ", topic, data);
        });

        this._conn.on('batch-updates', (topic, data) =>{
            console.log("Received order updates ", topic, data);
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
                });
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
        };
        return this.sendPromise(message);
    }

    async placeOrder(data) {
        var requestId = this._getRequestID();
        var message = {
            type: "request-response",
            event: data.quoteId+requestId,
            topic: "createorder",
            data
        };
        return this.sendPromise(message);
    }

    async cancelOrder(orderId) {
        var requestId = this._getRequestID();
        var message = {
            type: "request-response",
            event: requestId,
            topic: `cancelorder/${orderId}`,
            data : {}
        };
        return this.sendPromise(message);
    }
    
}

// export default new DVOTC();

export { DVOTC };
