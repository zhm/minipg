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

let nextClientID = 0;

class Client {
  constructor() {
    this.nativeClient = new NativeClient();
    this.id = ++nextClientID;
  }

  connect(string, callback) {
    this.nativeClient.connect(string, err => {
      if (err) {
        return callback(err, this);
      }

      this.nativeClient.setNoticeProcessor(Client.defaultNoticeProcessor || defaultNoticeProcessor);

      return callback(null, this);
    });
  }

  query(sql) {
    if (!this.nativeClient.finished()) {
      throw new Error('client in use', this.id);
    }

    this.nativeClient.query(sql);

    return new _cursor2.default(this);
  }

  // fetch a single result record
  getResult(returnMetadata, callback) {
    Client.setImmediate(() => {
      callback(this.nativeClient.getResult(returnMetadata));
    });
  }

  getResults(returnMetadata, callback) {
    Client.setImmediate(() => {
      callback(this.nativeClient.getResults(returnMetadata));
    });
  }

  close() {
    return this.nativeClient.close();
  }

  setNoticeProcessor(processor) {
    this.nativeClient.setNoticeProcessor(processor);
  }

  get lastError() {
    const error = this.nativeClient.lastError();

    if (error == null) {
      return null;
    }

    const queryError = new Error();

    for (const prop in error) {
      if (error.hasOwnProperty(prop)) {
        queryError[prop] = error[prop];
      }
    }

    return queryError;
  }
}

exports.Client = Client;
Client.setImmediate = setImmediate;
Client.defaultNoticeProcessor = defaultNoticeProcessor;

function createPool(options) {
  /* eslint-disable new-cap */
  return genericPool.Pool({
    name: options.name || 'minipg',
    create: callback => {
      new Client().connect(options.db, (err, client) => {
        if (err) {
          return callback(client ? client.lastError : err);
        }

        return callback(null, client);
      });
    },
    destroy: client => {
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