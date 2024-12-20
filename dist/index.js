"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Client = void 0;
exports.createPool = createPool;
var _cursor = _interopRequireDefault(require("./cursor"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var NativeClient = require('bindings')('addon').Client;
var genericPool = require('generic-pool');
function defaultNoticeProcessor(message) {
  console.warn(message);
}
var nextClientID = 0;
var Client = exports.Client = /*#__PURE__*/function () {
  function Client() {
    _classCallCheck(this, Client);
    this.nativeClient = new NativeClient();
    this.id = ++nextClientID;
  }
  return _createClass(Client, [{
    key: "connect",
    value: function connect(string, callback) {
      var _this = this;
      this.nativeClient.connect(string, function (err) {
        if (err) {
          return callback(err, _this);
        }
        _this.nativeClient.setNoticeProcessor(Client.defaultNoticeProcessor || defaultNoticeProcessor);
        return callback(null, _this);
      });
    }
  }, {
    key: "query",
    value: function query(sql) {
      if (!this.nativeClient.finished()) {
        throw new Error('client in use', this.id);
      }
      this.nativeClient.query(sql);
      return new _cursor["default"](this);
    }

    // fetch a single result record
  }, {
    key: "getResult",
    value: function getResult(returnMetadata, callback) {
      var _this2 = this;
      Client.setImmediate(function () {
        callback(_this2.nativeClient.getResult(returnMetadata));
      });
    }
  }, {
    key: "getResults",
    value: function getResults(returnMetadata, callback) {
      var _this3 = this;
      Client.setImmediate(function () {
        callback(_this3.nativeClient.getResults(returnMetadata));
      });
    }
  }, {
    key: "close",
    value: function close() {
      return this.nativeClient.close();
    }
  }, {
    key: "setNoticeProcessor",
    value: function setNoticeProcessor(processor) {
      this.nativeClient.setNoticeProcessor(processor);
    }
  }, {
    key: "lastError",
    get: function get() {
      var error = this.nativeClient.lastError();
      if (error == null) {
        return null;
      }
      var queryError = new Error();
      for (var prop in error) {
        if (error.hasOwnProperty(prop)) {
          queryError[prop] = error[prop];
        }
      }
      return queryError;
    }
  }]);
}();
Client.setImmediate = setImmediate;
Client.defaultNoticeProcessor = defaultNoticeProcessor;
function createPool(options) {
  /* eslint-disable new-cap */
  return genericPool.Pool({
    name: options.name || 'minipg',
    create: function create(callback) {
      new Client().connect(options.db, function (err, client) {
        if (err) {
          return callback(client ? client.lastError || err : err);
        }
        return callback(null, client);
      });
    },
    destroy: function destroy(client) {
      if (client) {
        client.close();
      }
    },
    max: options.max || 10,
    idleTimeoutMillis: options.idleTimeoutMillis || 30000,
    reapIntervalMillis: options.reapIntervalMillis || 1000,
    log: options.log
  });
  /* eslint-enable new-cap */
}
//# sourceMappingURL=index.js.map