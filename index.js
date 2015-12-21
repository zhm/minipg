var NativeClient = require('bindings')('addon').Client;
var genericPool = require('generic-pool');

function Client() {
  this.nativeClient = new NativeClient();
}

Client.prototype.connect = function (string) {
  this.nativeClient.connect(string);
  return this;
};

Client.prototype.query = function (sql) {
  this.nativeClient.query(sql);

  var cursor = {};
  var nativeClient = this.nativeClient;

  cursor.index = -1;
  cursor.columns = null;

  cursor.each = function (callback) {
    cursor.next(function (err, finished, row, index) {
      callback(err, finished, row, index);

      if (!finished) {
        cursor.each(callback);
      }
    });
  }.bind(this);

  cursor.next = function (callback) {
    var returnMetadata = (cursor.index === -1);

    this.getResult(returnMetadata, function (row) {
      if (returnMetadata && row) {
        cursor.columns = row.columns;
      }

      if (row) {
        cursor.index += 1;
        row.columns = cursor.columns;
      }

      callback(nativeClient.lastError(), nativeClient.finished(), row, cursor.index);
    });
  }.bind(this);

  cursor.finished = function () {
    return nativeClient.finished();
  };

  return cursor;
};

Client.prototype.getResult = function (returnMetadata, callback) {
  process.nextTick(function () {
    callback(this.nativeClient.getResult(returnMetadata));
  }.bind(this));
};

Client.prototype.close = function () {
  return this.nativeClient.close();
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
    log: options.log
  });
}

module.exports = {
  Client: Client,
  createPool: createPool
};
