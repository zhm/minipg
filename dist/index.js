'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Client = undefined;
exports.createPool = createPool;

var _cursor = require('./cursor');

var _cursor2 = _interopRequireDefault(_cursor);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const NativeClient = require('bindings')('addon').Client;
const genericPool = require('generic-pool');

function defaultNoticeProcessor(message) {
  console.warn(message);
}

class Client {
  constructor() {
    this.nativeClient = new NativeClient();
  }

  connect(string) {
    this.nativeClient.connect(string);
    this.nativeClient.setNoticeProcessor(Client.defaultNoticeProcessor || defaultNoticeProcessor);
    return this;
  }

  query(sql) {
    this.nativeClient.query(sql);

    return new _cursor2.default(this);
  }

  // fetch a single result record
  getResult(returnMetadata, callback) {
    setImmediate(() => {
      callback(this.nativeClient.getResult(returnMetadata));
    });
  }

  getResults(returnMetadata, callback) {
    setImmediate(() => {
      callback(this.nativeClient.getResults(returnMetadata));
    });
  }

  close() {
    return this.nativeClient.close();
  }

  setNoticeProcessor(processor) {
    this.nativeClient.setNoticeProcessor(processor);
  }
}

exports.Client = Client;
Client.defaultNoticeProcessor = defaultNoticeProcessor;

function createPool(options) {
  /* eslint-disable new-cap */
  return genericPool.Pool({
    name: options.name || 'minipg',
    create: callback => {
      try {
        return callback(null, new Client().connect(options.db));
      } catch (err) {
        return callback(err);
      }
    },
    destroy: client => {
      client.close();
    },
    max: options.max || 10,
    idleTimeoutMillis: options.idleTimeoutMillis || 30000,
    reapIntervalMillis: options.reapIntervalMillis || 1000,
    log: options.log
  });
  /* eslint-enable new-cap */
}
//# sourceMappingURL=index.js.map