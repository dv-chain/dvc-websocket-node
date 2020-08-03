var DVOTC = (function (exports, WebSocket) {
  'use strict';

  WebSocket = WebSocket && Object.prototype.hasOwnProperty.call(WebSocket, 'default') ? WebSocket['default'] : WebSocket;

  var crypto = {};

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
        let headers;
        if(this.key && this.secret) {
          headers = { headers: getHeaders({key: this.key, secret: this.secret}) };
        }
        ws = new WebSocket(self.url, headers);
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

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function createCommonjsModule(fn, basedir, module) {
  	return module = {
  	  path: basedir,
  	  exports: {},
  	  require: function (path, base) {
        return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
      }
  	}, fn(module, module.exports), module.exports;
  }

  function commonjsRequire () {
  	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
  }

  var domain;

  // This constructor is used to store event handlers. Instantiating this is
  // faster than explicitly calling `Object.create(null)` to get a "clean" empty
  // object (tested with v8 v4.9).
  function EventHandlers() {}
  EventHandlers.prototype = Object.create(null);

  function EventEmitter() {
    EventEmitter.init.call(this);
  }

  // nodejs oddity
  // require('events') === require('events').EventEmitter
  EventEmitter.EventEmitter = EventEmitter;

  EventEmitter.usingDomains = false;

  EventEmitter.prototype.domain = undefined;
  EventEmitter.prototype._events = undefined;
  EventEmitter.prototype._maxListeners = undefined;

  // By default EventEmitters will print a warning if more than 10 listeners are
  // added to it. This is a useful default which helps finding memory leaks.
  EventEmitter.defaultMaxListeners = 10;

  EventEmitter.init = function() {
    this.domain = null;
    if (EventEmitter.usingDomains) {
      // if there is an active domain, then attach to it.
      if (domain.active ) ;
    }

    if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
      this._events = new EventHandlers();
      this._eventsCount = 0;
    }

    this._maxListeners = this._maxListeners || undefined;
  };

  // Obviously not all Emitters should be limited to 10. This function allows
  // that to be increased. Set to zero for unlimited.
  EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
    if (typeof n !== 'number' || n < 0 || isNaN(n))
      throw new TypeError('"n" argument must be a positive number');
    this._maxListeners = n;
    return this;
  };

  function $getMaxListeners(that) {
    if (that._maxListeners === undefined)
      return EventEmitter.defaultMaxListeners;
    return that._maxListeners;
  }

  EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
    return $getMaxListeners(this);
  };

  // These standalone emit* functions are used to optimize calling of event
  // handlers for fast cases because emit() itself often has a variable number of
  // arguments and can be deoptimized because of that. These functions always have
  // the same number of arguments and thus do not get deoptimized, so the code
  // inside them can execute faster.
  function emitNone(handler, isFn, self) {
    if (isFn)
      handler.call(self);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self);
    }
  }
  function emitOne(handler, isFn, self, arg1) {
    if (isFn)
      handler.call(self, arg1);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self, arg1);
    }
  }
  function emitTwo(handler, isFn, self, arg1, arg2) {
    if (isFn)
      handler.call(self, arg1, arg2);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self, arg1, arg2);
    }
  }
  function emitThree(handler, isFn, self, arg1, arg2, arg3) {
    if (isFn)
      handler.call(self, arg1, arg2, arg3);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].call(self, arg1, arg2, arg3);
    }
  }

  function emitMany(handler, isFn, self, args) {
    if (isFn)
      handler.apply(self, args);
    else {
      var len = handler.length;
      var listeners = arrayClone(handler, len);
      for (var i = 0; i < len; ++i)
        listeners[i].apply(self, args);
    }
  }

  EventEmitter.prototype.emit = function emit(type) {
    var er, handler, len, args, i, events, domain;
    var doError = (type === 'error');

    events = this._events;
    if (events)
      doError = (doError && events.error == null);
    else if (!doError)
      return false;

    domain = this.domain;

    // If there is no 'error' event listener then throw.
    if (doError) {
      er = arguments[1];
      if (domain) {
        if (!er)
          er = new Error('Uncaught, unspecified "error" event');
        er.domainEmitter = this;
        er.domain = domain;
        er.domainThrown = false;
        domain.emit('error', er);
      } else if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        // At least give some kind of context to the user
        var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
        err.context = er;
        throw err;
      }
      return false;
    }

    handler = events[type];

    if (!handler)
      return false;

    var isFn = typeof handler === 'function';
    len = arguments.length;
    switch (len) {
      // fast cases
      case 1:
        emitNone(handler, isFn, this);
        break;
      case 2:
        emitOne(handler, isFn, this, arguments[1]);
        break;
      case 3:
        emitTwo(handler, isFn, this, arguments[1], arguments[2]);
        break;
      case 4:
        emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
        break;
      // slower
      default:
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        emitMany(handler, isFn, this, args);
    }

    return true;
  };

  function _addListener(target, type, listener, prepend) {
    var m;
    var events;
    var existing;

    if (typeof listener !== 'function')
      throw new TypeError('"listener" argument must be a function');

    events = target._events;
    if (!events) {
      events = target._events = new EventHandlers();
      target._eventsCount = 0;
    } else {
      // To avoid recursion in the case that type === "newListener"! Before
      // adding it to the listeners, first emit "newListener".
      if (events.newListener) {
        target.emit('newListener', type,
                    listener.listener ? listener.listener : listener);

        // Re-assign `events` because a newListener handler could have caused the
        // this._events to be assigned to a new object
        events = target._events;
      }
      existing = events[type];
    }

    if (!existing) {
      // Optimize the case of one listener. Don't need the extra array object.
      existing = events[type] = listener;
      ++target._eventsCount;
    } else {
      if (typeof existing === 'function') {
        // Adding the second element, need to change to array.
        existing = events[type] = prepend ? [listener, existing] :
                                            [existing, listener];
      } else {
        // If we've already got an array, just append.
        if (prepend) {
          existing.unshift(listener);
        } else {
          existing.push(listener);
        }
      }

      // Check for listener leak
      if (!existing.warned) {
        m = $getMaxListeners(target);
        if (m && m > 0 && existing.length > m) {
          existing.warned = true;
          var w = new Error('Possible EventEmitter memory leak detected. ' +
                              existing.length + ' ' + type + ' listeners added. ' +
                              'Use emitter.setMaxListeners() to increase limit');
          w.name = 'MaxListenersExceededWarning';
          w.emitter = target;
          w.type = type;
          w.count = existing.length;
          emitWarning(w);
        }
      }
    }

    return target;
  }
  function emitWarning(e) {
    typeof console.warn === 'function' ? console.warn(e) : console.log(e);
  }
  EventEmitter.prototype.addListener = function addListener(type, listener) {
    return _addListener(this, type, listener, false);
  };

  EventEmitter.prototype.on = EventEmitter.prototype.addListener;

  EventEmitter.prototype.prependListener =
      function prependListener(type, listener) {
        return _addListener(this, type, listener, true);
      };

  function _onceWrap(target, type, listener) {
    var fired = false;
    function g() {
      target.removeListener(type, g);
      if (!fired) {
        fired = true;
        listener.apply(target, arguments);
      }
    }
    g.listener = listener;
    return g;
  }

  EventEmitter.prototype.once = function once(type, listener) {
    if (typeof listener !== 'function')
      throw new TypeError('"listener" argument must be a function');
    this.on(type, _onceWrap(this, type, listener));
    return this;
  };

  EventEmitter.prototype.prependOnceListener =
      function prependOnceListener(type, listener) {
        if (typeof listener !== 'function')
          throw new TypeError('"listener" argument must be a function');
        this.prependListener(type, _onceWrap(this, type, listener));
        return this;
      };

  // emits a 'removeListener' event iff the listener was removed
  EventEmitter.prototype.removeListener =
      function removeListener(type, listener) {
        var list, events, position, i, originalListener;

        if (typeof listener !== 'function')
          throw new TypeError('"listener" argument must be a function');

        events = this._events;
        if (!events)
          return this;

        list = events[type];
        if (!list)
          return this;

        if (list === listener || (list.listener && list.listener === listener)) {
          if (--this._eventsCount === 0)
            this._events = new EventHandlers();
          else {
            delete events[type];
            if (events.removeListener)
              this.emit('removeListener', type, list.listener || listener);
          }
        } else if (typeof list !== 'function') {
          position = -1;

          for (i = list.length; i-- > 0;) {
            if (list[i] === listener ||
                (list[i].listener && list[i].listener === listener)) {
              originalListener = list[i].listener;
              position = i;
              break;
            }
          }

          if (position < 0)
            return this;

          if (list.length === 1) {
            list[0] = undefined;
            if (--this._eventsCount === 0) {
              this._events = new EventHandlers();
              return this;
            } else {
              delete events[type];
            }
          } else {
            spliceOne(list, position);
          }

          if (events.removeListener)
            this.emit('removeListener', type, originalListener || listener);
        }

        return this;
      };

  EventEmitter.prototype.removeAllListeners =
      function removeAllListeners(type) {
        var listeners, events;

        events = this._events;
        if (!events)
          return this;

        // not listening for removeListener, no need to emit
        if (!events.removeListener) {
          if (arguments.length === 0) {
            this._events = new EventHandlers();
            this._eventsCount = 0;
          } else if (events[type]) {
            if (--this._eventsCount === 0)
              this._events = new EventHandlers();
            else
              delete events[type];
          }
          return this;
        }

        // emit removeListener for all listeners on all events
        if (arguments.length === 0) {
          var keys = Object.keys(events);
          for (var i = 0, key; i < keys.length; ++i) {
            key = keys[i];
            if (key === 'removeListener') continue;
            this.removeAllListeners(key);
          }
          this.removeAllListeners('removeListener');
          this._events = new EventHandlers();
          this._eventsCount = 0;
          return this;
        }

        listeners = events[type];

        if (typeof listeners === 'function') {
          this.removeListener(type, listeners);
        } else if (listeners) {
          // LIFO order
          do {
            this.removeListener(type, listeners[listeners.length - 1]);
          } while (listeners[0]);
        }

        return this;
      };

  EventEmitter.prototype.listeners = function listeners(type) {
    var evlistener;
    var ret;
    var events = this._events;

    if (!events)
      ret = [];
    else {
      evlistener = events[type];
      if (!evlistener)
        ret = [];
      else if (typeof evlistener === 'function')
        ret = [evlistener.listener || evlistener];
      else
        ret = unwrapListeners(evlistener);
    }

    return ret;
  };

  EventEmitter.listenerCount = function(emitter, type) {
    if (typeof emitter.listenerCount === 'function') {
      return emitter.listenerCount(type);
    } else {
      return listenerCount.call(emitter, type);
    }
  };

  EventEmitter.prototype.listenerCount = listenerCount;
  function listenerCount(type) {
    var events = this._events;

    if (events) {
      var evlistener = events[type];

      if (typeof evlistener === 'function') {
        return 1;
      } else if (evlistener) {
        return evlistener.length;
      }
    }

    return 0;
  }

  EventEmitter.prototype.eventNames = function eventNames() {
    return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
  };

  // About 1.5x faster than the two-arg version of Array#splice().
  function spliceOne(list, index) {
    for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
      list[i] = list[k];
    list.pop();
  }

  function arrayClone(arr, i) {
    var copy = new Array(i);
    while (i--)
      copy[i] = arr[i];
    return copy;
  }

  function unwrapListeners(arr) {
    var ret = new Array(arr.length);
    for (var i = 0; i < ret.length; ++i) {
      ret[i] = arr[i].listener || arr[i];
    }
    return ret;
  }

  var inherits;
  if (typeof Object.create === 'function'){
    inherits = function inherits(ctor, superCtor) {
      // implementation from standard node.js 'util' module
      ctor.super_ = superCtor;
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      });
    };
  } else {
    inherits = function inherits(ctor, superCtor) {
      ctor.super_ = superCtor;
      var TempCtor = function () {};
      TempCtor.prototype = superCtor.prototype;
      ctor.prototype = new TempCtor();
      ctor.prototype.constructor = ctor;
    };
  }
  var inherits$1 = inherits;

  // Copyright Joyent, Inc. and other Node contributors.
  var formatRegExp = /%[sdj%]/g;
  function format(f) {
    if (!isString(f)) {
      var objects = [];
      for (var i = 0; i < arguments.length; i++) {
        objects.push(inspect(arguments[i]));
      }
      return objects.join(' ');
    }

    var i = 1;
    var args = arguments;
    var len = args.length;
    var str = String(f).replace(formatRegExp, function(x) {
      if (x === '%%') return '%';
      if (i >= len) return x;
      switch (x) {
        case '%s': return String(args[i++]);
        case '%d': return Number(args[i++]);
        case '%j':
          try {
            return JSON.stringify(args[i++]);
          } catch (_) {
            return '[Circular]';
          }
        default:
          return x;
      }
    });
    for (var x = args[i]; i < len; x = args[++i]) {
      if (isNull(x) || !isObject(x)) {
        str += ' ' + x;
      } else {
        str += ' ' + inspect(x);
      }
    }
    return str;
  }

  // Mark that a method should not be used.
  // Returns a modified function which warns once by default.
  // If --no-deprecation is set, then it is a no-op.
  function deprecate(fn, msg) {
    // Allow for deprecating things in the process of starting up.
    if (isUndefined(global.process)) {
      return function() {
        return deprecate(fn, msg).apply(this, arguments);
      };
    }

    var warned = false;
    function deprecated() {
      if (!warned) {
        {
          console.error(msg);
        }
        warned = true;
      }
      return fn.apply(this, arguments);
    }

    return deprecated;
  }

  var debugs = {};
  var debugEnviron;
  function debuglog(set) {
    if (isUndefined(debugEnviron))
      debugEnviron =  '';
    set = set.toUpperCase();
    if (!debugs[set]) {
      if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
        var pid = 0;
        debugs[set] = function() {
          var msg = format.apply(null, arguments);
          console.error('%s %d: %s', set, pid, msg);
        };
      } else {
        debugs[set] = function() {};
      }
    }
    return debugs[set];
  }

  /**
   * Echos the value of a value. Trys to print the value out
   * in the best way possible given the different types.
   *
   * @param {Object} obj The object to print out.
   * @param {Object} opts Optional options object that alters the output.
   */
  /* legacy: obj, showHidden, depth, colors*/
  function inspect(obj, opts) {
    // default options
    var ctx = {
      seen: [],
      stylize: stylizeNoColor
    };
    // legacy...
    if (arguments.length >= 3) ctx.depth = arguments[2];
    if (arguments.length >= 4) ctx.colors = arguments[3];
    if (isBoolean(opts)) {
      // legacy...
      ctx.showHidden = opts;
    } else if (opts) {
      // got an "options" object
      _extend(ctx, opts);
    }
    // set default options
    if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
    if (isUndefined(ctx.depth)) ctx.depth = 2;
    if (isUndefined(ctx.colors)) ctx.colors = false;
    if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
    if (ctx.colors) ctx.stylize = stylizeWithColor;
    return formatValue(ctx, obj, ctx.depth);
  }

  // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
  inspect.colors = {
    'bold' : [1, 22],
    'italic' : [3, 23],
    'underline' : [4, 24],
    'inverse' : [7, 27],
    'white' : [37, 39],
    'grey' : [90, 39],
    'black' : [30, 39],
    'blue' : [34, 39],
    'cyan' : [36, 39],
    'green' : [32, 39],
    'magenta' : [35, 39],
    'red' : [31, 39],
    'yellow' : [33, 39]
  };

  // Don't use 'blue' not visible on cmd.exe
  inspect.styles = {
    'special': 'cyan',
    'number': 'yellow',
    'boolean': 'yellow',
    'undefined': 'grey',
    'null': 'bold',
    'string': 'green',
    'date': 'magenta',
    // "name": intentionally not styling
    'regexp': 'red'
  };


  function stylizeWithColor(str, styleType) {
    var style = inspect.styles[styleType];

    if (style) {
      return '\u001b[' + inspect.colors[style][0] + 'm' + str +
             '\u001b[' + inspect.colors[style][1] + 'm';
    } else {
      return str;
    }
  }


  function stylizeNoColor(str, styleType) {
    return str;
  }


  function arrayToHash(array) {
    var hash = {};

    array.forEach(function(val, idx) {
      hash[val] = true;
    });

    return hash;
  }


  function formatValue(ctx, value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (ctx.customInspect &&
        value &&
        isFunction(value.inspect) &&
        // Filter out the util module, it's inspect function is special
        value.inspect !== inspect &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      var ret = value.inspect(recurseTimes, ctx);
      if (!isString(ret)) {
        ret = formatValue(ctx, ret, recurseTimes);
      }
      return ret;
    }

    // Primitive types cannot have properties
    var primitive = formatPrimitive(ctx, value);
    if (primitive) {
      return primitive;
    }

    // Look up the keys of the object.
    var keys = Object.keys(value);
    var visibleKeys = arrayToHash(keys);

    if (ctx.showHidden) {
      keys = Object.getOwnPropertyNames(value);
    }

    // IE doesn't make error fields non-enumerable
    // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
    if (isError(value)
        && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
      return formatError(value);
    }

    // Some type of object without properties can be shortcutted.
    if (keys.length === 0) {
      if (isFunction(value)) {
        var name = value.name ? ': ' + value.name : '';
        return ctx.stylize('[Function' + name + ']', 'special');
      }
      if (isRegExp(value)) {
        return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
      }
      if (isDate(value)) {
        return ctx.stylize(Date.prototype.toString.call(value), 'date');
      }
      if (isError(value)) {
        return formatError(value);
      }
    }

    var base = '', array = false, braces = ['{', '}'];

    // Make Array say that they are Array
    if (isArray(value)) {
      array = true;
      braces = ['[', ']'];
    }

    // Make functions say that they are functions
    if (isFunction(value)) {
      var n = value.name ? ': ' + value.name : '';
      base = ' [Function' + n + ']';
    }

    // Make RegExps say that they are RegExps
    if (isRegExp(value)) {
      base = ' ' + RegExp.prototype.toString.call(value);
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + Date.prototype.toUTCString.call(value);
    }

    // Make error with message first say the error
    if (isError(value)) {
      base = ' ' + formatError(value);
    }

    if (keys.length === 0 && (!array || value.length == 0)) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
      } else {
        return ctx.stylize('[Object]', 'special');
      }
    }

    ctx.seen.push(value);

    var output;
    if (array) {
      output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
    } else {
      output = keys.map(function(key) {
        return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
      });
    }

    ctx.seen.pop();

    return reduceToSingleString(output, base, braces);
  }


  function formatPrimitive(ctx, value) {
    if (isUndefined(value))
      return ctx.stylize('undefined', 'undefined');
    if (isString(value)) {
      var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                               .replace(/'/g, "\\'")
                                               .replace(/\\"/g, '"') + '\'';
      return ctx.stylize(simple, 'string');
    }
    if (isNumber(value))
      return ctx.stylize('' + value, 'number');
    if (isBoolean(value))
      return ctx.stylize('' + value, 'boolean');
    // For some reason typeof null is "object", so special case here.
    if (isNull(value))
      return ctx.stylize('null', 'null');
  }


  function formatError(value) {
    return '[' + Error.prototype.toString.call(value) + ']';
  }


  function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
    var output = [];
    for (var i = 0, l = value.length; i < l; ++i) {
      if (hasOwnProperty(value, String(i))) {
        output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
            String(i), true));
      } else {
        output.push('');
      }
    }
    keys.forEach(function(key) {
      if (!key.match(/^\d+$/)) {
        output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
            key, true));
      }
    });
    return output;
  }


  function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
    var name, str, desc;
    desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
    if (desc.get) {
      if (desc.set) {
        str = ctx.stylize('[Getter/Setter]', 'special');
      } else {
        str = ctx.stylize('[Getter]', 'special');
      }
    } else {
      if (desc.set) {
        str = ctx.stylize('[Setter]', 'special');
      }
    }
    if (!hasOwnProperty(visibleKeys, key)) {
      name = '[' + key + ']';
    }
    if (!str) {
      if (ctx.seen.indexOf(desc.value) < 0) {
        if (isNull(recurseTimes)) {
          str = formatValue(ctx, desc.value, null);
        } else {
          str = formatValue(ctx, desc.value, recurseTimes - 1);
        }
        if (str.indexOf('\n') > -1) {
          if (array) {
            str = str.split('\n').map(function(line) {
              return '  ' + line;
            }).join('\n').substr(2);
          } else {
            str = '\n' + str.split('\n').map(function(line) {
              return '   ' + line;
            }).join('\n');
          }
        }
      } else {
        str = ctx.stylize('[Circular]', 'special');
      }
    }
    if (isUndefined(name)) {
      if (array && key.match(/^\d+$/)) {
        return str;
      }
      name = JSON.stringify('' + key);
      if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
        name = name.substr(1, name.length - 2);
        name = ctx.stylize(name, 'name');
      } else {
        name = name.replace(/'/g, "\\'")
                   .replace(/\\"/g, '"')
                   .replace(/(^"|"$)/g, "'");
        name = ctx.stylize(name, 'string');
      }
    }

    return name + ': ' + str;
  }


  function reduceToSingleString(output, base, braces) {
    var length = output.reduce(function(prev, cur) {
      if (cur.indexOf('\n') >= 0) ;
      return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
    }, 0);

    if (length > 60) {
      return braces[0] +
             (base === '' ? '' : base + '\n ') +
             ' ' +
             output.join(',\n  ') +
             ' ' +
             braces[1];
    }

    return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
  }


  // NOTE: These type checking functions intentionally don't use `instanceof`
  // because it is fragile and can be easily faked with `Object.create()`.
  function isArray(ar) {
    return Array.isArray(ar);
  }

  function isBoolean(arg) {
    return typeof arg === 'boolean';
  }

  function isNull(arg) {
    return arg === null;
  }

  function isNullOrUndefined(arg) {
    return arg == null;
  }

  function isNumber(arg) {
    return typeof arg === 'number';
  }

  function isString(arg) {
    return typeof arg === 'string';
  }

  function isSymbol(arg) {
    return typeof arg === 'symbol';
  }

  function isUndefined(arg) {
    return arg === void 0;
  }

  function isRegExp(re) {
    return isObject(re) && objectToString(re) === '[object RegExp]';
  }

  function isObject(arg) {
    return typeof arg === 'object' && arg !== null;
  }

  function isDate(d) {
    return isObject(d) && objectToString(d) === '[object Date]';
  }

  function isError(e) {
    return isObject(e) &&
        (objectToString(e) === '[object Error]' || e instanceof Error);
  }

  function isFunction(arg) {
    return typeof arg === 'function';
  }

  function isPrimitive(arg) {
    return arg === null ||
           typeof arg === 'boolean' ||
           typeof arg === 'number' ||
           typeof arg === 'string' ||
           typeof arg === 'symbol' ||  // ES6 symbol
           typeof arg === 'undefined';
  }

  function isBuffer(maybeBuf) {
    return Buffer.isBuffer(maybeBuf);
  }

  function objectToString(o) {
    return Object.prototype.toString.call(o);
  }


  function pad(n) {
    return n < 10 ? '0' + n.toString(10) : n.toString(10);
  }


  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
                'Oct', 'Nov', 'Dec'];

  // 26 Feb 16:19:34
  function timestamp() {
    var d = new Date();
    var time = [pad(d.getHours()),
                pad(d.getMinutes()),
                pad(d.getSeconds())].join(':');
    return [d.getDate(), months[d.getMonth()], time].join(' ');
  }


  // log is just a thin wrapper to console.log that prepends a timestamp
  function log() {
    console.log('%s - %s', timestamp(), format.apply(null, arguments));
  }

  function _extend(origin, add) {
    // Don't do anything if add isn't an object
    if (!add || !isObject(add)) return origin;

    var keys = Object.keys(add);
    var i = keys.length;
    while (i--) {
      origin[keys[i]] = add[keys[i]];
    }
    return origin;
  }
  function hasOwnProperty(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  }

  var util = {
    inherits: inherits$1,
    _extend: _extend,
    log: log,
    isBuffer: isBuffer,
    isPrimitive: isPrimitive,
    isFunction: isFunction,
    isError: isError,
    isDate: isDate,
    isObject: isObject,
    isRegExp: isRegExp,
    isUndefined: isUndefined,
    isSymbol: isSymbol,
    isString: isString,
    isNumber: isNumber,
    isNullOrUndefined: isNullOrUndefined,
    isNull: isNull,
    isBoolean: isBoolean,
    isArray: isArray,
    inspect: inspect,
    deprecate: deprecate,
    format: format,
    debuglog: debuglog
  };

  var EntryEmptyEmitter_1 = createCommonjsModule(function (module) {
  /**
   * Created by AAravindan on 1/26/16.
   */




  function EntryEmptyEmitter() {
      EventEmitter.call(this);
      this.keys = {};
  }

  util.inherits(EntryEmptyEmitter, EventEmitter);

  EntryEmptyEmitter.prototype.add = function(key){
      this.keys[key] ? this.keys[key]++ : (this.keys[key] = 1);
      if(this.keys[key] === 1){
          this.emit('entry:'+key,key);
          this.emit('entry',key);
      }
  };

  EntryEmptyEmitter.prototype.remove = function(key){
      this.keys[key] ? this.keys[key]-- : (this.keys[key] = 0);
      if(this.keys[key] <= 0){
          this.keys[key] = 0;
          this.emit('empty',key);
          this.emit('empty:'+key,key);
      }
  };

  EntryEmptyEmitter.prototype.status = function(){
      return this.keys;
  };

  EntryEmptyEmitter.prototype.reset = function(key){
      delete this.keys[key];
  };

  EntryEmptyEmitter.prototype.getCount = function(key){
      return this.keys[key];
  };

  commonjsGlobal.EntryEmptyEmitter = module.exports = EntryEmptyEmitter;
  });

  var simplePubsub = createCommonjsModule(function (module) {
  function PubSub() {
    EntryEmptyEmitter_1.call(this);
    this.topics = {};
    this.subUid = -1;
  }

  util.inherits(PubSub, EntryEmptyEmitter_1);

  PubSub.prototype.publish = function (topic, args) {
    if (!this.topics[topic]) {
      return false;
    }
    var subscribers = this.topics[topic], len = subscribers ? subscribers.length : 0;
    while (len--) {
      subscribers[len].func(topic, args);
    }
    return true;
  };
  PubSub.prototype.subscribe = function (topic, func) {
    if (!this.topics[topic]) {
      this.topics[topic] = [];
    }
    var token = (++this.subUid).toString();
    this.topics[topic].push({
      token: token,
      func: func
    });
    this.add(topic);
    return token;
  };
  PubSub.prototype.unsubscribe = function (token) {
    for (var m in this.topics) {
      if (this.topics[m]) {
        for (var i = 0, j = this.topics[m].length; i < j; i++) {
          if (this.topics[m][i].token === token) {
            this.topics[m].splice(i, 1);
            this.remove(m);
            return true;
          }
        }
        if (this.topics[m].length == 0) {
          delete this.topics[m];
        }
      }
    }
    return false;
  };

  commonjsGlobal.Pubsub = module.exports = PubSub;
  });

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
          this._levelPublisher = new simplePubsub();
          this._orderStatusPublisher = new simplePubsub();
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
                  let orderstatusSubscriptions = this._orderStatusPublisher.status();
                  this._subscribeSubscriptions(orderstatusSubscriptions, 'order-updates');
                  resolve();
              };
          });

          this._conn.on('levels', (topic, data) =>{
              this._levelPublisher.publish(topic, data);
          });

          this._conn.on('order-updates', (topic, data) =>{
              this._orderStatusPublisher.publish(topic, data);
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

          this._orderStatusPublisher.on('entry',  (topic) => {
              this._subscribeOrderStatusServer(topic);
          });
          
          this._orderStatusPublisher.on('empty',  (topic) => {
              this._unsubscribeOrderStatusServer(topic);
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

      _subscribeOrderStatusServer(topic) {
          this._conn.sendMessage({
              type: "subscribe",
              event: "order-updates",
              topic : topic,
          });
          console.log(`subscribed order updates for ${topic}`);
      }

      _unsubscribeOrderStatusServer(topic) {
          this._conn.sendMessage({
              type: "unsubscribe",
              event: "order-updates",
              topic
          });
          console.log(`unsubscribed order updates for ${topic}`);
      };

      
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

      subscribeOrderStatus(topic, callback) {
          return this._orderStatusPublisher.subscribe(topic, callback).toString();
      }
      
      unSubscribeOrderStatus (subscriptionId) {
          this._orderStatusPublisher.unsubscribe(subscriptionId);
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
              type : 'request-response',
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

  exports.DVOTC = DVOTC;

  return exports;

}({}, WebSocket));
