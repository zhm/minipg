const NativeClient = require('bindings')('addon').Client;
const genericPool = require('generic-pool');

import Cursor from './cursor';

function defaultNoticeProcessor(message) {
  console.warn(message);
}

let nextClientID = 0;

export class Client {
  constructor() {
    this.nativeClient = new NativeClient();
    this.id = ++nextClientID;
  }

  connect(string) {
    this.nativeClient.connect(string);
    this.nativeClient.setNoticeProcessor(Client.defaultNoticeProcessor || defaultNoticeProcessor);
    return this;
  }

  query(sql) {
    if (!this.nativeClient.finished()) {
      throw new Error('client in use', this.id);
    }

    this.nativeClient.query(sql);

    return new Cursor(this);
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

Client.defaultNoticeProcessor = defaultNoticeProcessor;

export function createPool(options) {
  /* eslint-disable new-cap */
  return genericPool.Pool({
    name: options.name || 'minipg',
    create: (callback) => {
      try {
        return callback(null, new Client().connect(options.db));
      } catch (err) {
        return callback(err);
      }
    },
    destroy: (client) => {
      client.close();
    },
    max: options.max || 10,
    idleTimeoutMillis: options.idleTimeoutMillis || 30000,
    reapIntervalMillis: options.reapIntervalMillis || 1000,
    log: options.log
  });
  /* eslint-enable new-cap */
}
