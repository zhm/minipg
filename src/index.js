const NativeClient = require('bindings')('addon').Client;
const genericPool = require('generic-pool');

import Cursor from './cursor';

function defaultNoticeProcessor(message) {
  console.warn(message);
}

let nextClientID = 0;

let fastNextCount = 0;
const fastNextLimit = 10;

const fastFuture = (callback) => {
  if (fastNextCount >= fastNextLimit) {
    setImmediate(callback);
    fastNextCount = 0;
  } else {
    process.nextTick(callback);
  }
  fastNextCount++;
};

export class Client {
  constructor() {
    this.nativeClient = new NativeClient();
    this.id = ++nextClientID;
  }

  connect(string, callback) {
    this.nativeClient.connect(string, (err) => {
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

    return new Cursor(this);
  }

  // fetch a single result record
  getResult(returnMetadata, callback) {
    fastFuture(() => {
      callback(this.nativeClient.getResult(returnMetadata));
    });
  }

  getResults(returnMetadata, callback) {
    fastFuture(() => {
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

Client.defaultNoticeProcessor = defaultNoticeProcessor;

export function createPool(options) {
  /* eslint-disable new-cap */
  return genericPool.Pool({
    name: options.name || 'minipg',
    create: (callback) => {
      new Client().connect(options.db, (err, client) => {
        if (err) {
          return callback(client ? client.lastError : err);
        }

        return callback(null, client);
      });
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
