var NativeClient = require('bindings')('addon').Client;

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
    var returnMetadata = (cursor.index === -1);

    this.getResult(returnMetadata, function (row) {
      if (returnMetadata && row) {
        cursor.columns = row.columns;
      }

      if (row) {
        cursor.index += 1;
      }

      callback(nativeClient.lastError(), row, cursor.index);

      if (row) {
        cursor.each(callback);
      }
    });
  }.bind(this);

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

module.exports = Client;
