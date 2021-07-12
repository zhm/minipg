"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createPool = createPool;
exports.Client = void 0;

var _cursor = _interopRequireDefault(require("./cursor"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var NativeClient = require('bindings')('addon').Client;

var genericPool = require('generic-pool');

function defaultNoticeProcessor(message) {
  console.warn(message);
}

var nextClientID = 0;

var Client = /*#__PURE__*/function () {
  function Client() {
    _classCallCheck(this, Client);

    this.nativeClient = new NativeClient();
    this.id = ++nextClientID;
  }

  _createClass(Client, [{
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
    } // fetch a single result record

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

  return Client;
}();

exports.Client = Client;
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