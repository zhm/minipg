var NativeClient = require('bindings')('addon').Client;
var genericPool = require('generic-pool');

function defaultNoticeProcessor(message) {
  console.warn(message);
}

function Client() {
  this.nativeClient = new NativeClient();
}

Client.defaultNoticeProcessor = defaultNoticeProcessor;

Client.prototype.connect = function (string) {
  this.nativeClient.connect(string);
  this.nativeClient.setNoticeProcessor(Client.defaultNoticeProcessor || defaultNoticeProcessor);
  return this;
};

Client.prototype.query = function (sql) {
  this.nativeClient.query(sql);

  var cursor = {};
  var nativeClient = this.nativeClient;

  cursor.index = -1;
  cursor.columns = null;

  cursor.each = function (callback) {
    cursor.next(function (err, finished, columns, row, index) {
      callback(err, finished, columns, row, index);

      if (!finished) {
        cursor.each(callback);
      }
    });
  }.bind(this);

  cursor.next = function (callback) {
    var returnMetadata = (cursor.index === -1);

    this.getResult(returnMetadata, function (result) {
      if (returnMetadata && result && result.columns) {
        cursor.columns = result.columns;
      }

      if (result && result.values) {
        cursor.index += 1;
      }

      var values = result ? result.values : null;

      var error = nativeClient.lastError();

      if (error) {
        var queryError = new Error();

        for (var prop in error) {
          if (error.hasOwnProperty(prop)) {
            queryError[prop] = error[prop];
          }
        }

        error = queryError;
      }

      callback(error, nativeClient.finished(), cursor.columns, values, cursor.index);
    });
  }.bind(this);

  cursor.finished = function () {
    return nativeClient.finished();
  };

  return cursor;
};

Client.prototype.getResult = function (returnMetadata, callback) {
  setImmediate(function () {
    callback(this.nativeClient.getResult(returnMetadata));
  }.bind(this));
};

Client.prototype.close = function () {
  return this.nativeClient.close();
};

Client.prototype.setNoticeProcessor = function (processor) {
  this.nativeClient.setNoticeProcessor(processor);
};

function createPool(options) {
  return genericPool.Pool({
    name: options.name || 'minipg',
    create: function (callback) {
      callback(null, new Client().connect(options.db));
    },
    destroy: function (client) {
      client.close();
    },
    max: options.max || 10,
    idleTimeoutMillis: options.idleTimeoutMillis || 30000,
    reapIntervalMillis: options.reapIntervalMillis || 1000,
    log: options.log
  });
}

module.exports = {
  Client: Client,
  createPool: createPool
};
