var createPool = require('../').createPool;
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var db = 'dbname = postgres';
var sql = fs.readFileSync(path.join(__dirname, 'test.sql'));

var pool = createPool({db: db});

var execSQL = function (db, command, callback) {
  pool.acquire(function (err, client) {
    client.query(command).each(function(err, finished, row, index) {
      callback(err, finished, row, index);

      if (finished) {
        pool.release(client);
      }
    });
  });
};

describe('minipg', function () {
  it('should query the database', function (done) {
    var db = 'dbname = postgres';

    execSQL(db, sql, function (err, finished, row, index) {
      if (finished) {
        assert.equal(index, 3999);
        done();
      }
    });
  });

  it('should return errors', function (done) {
    var db = 'dbname = postgres';

    execSQL(db, 'sele', function (err, finished, row, index) {
      if (finished) {
        assert.equal(err, 'ERROR:  syntax error at or near "sele"\nLINE 1: sele\n        ^\n');
        done();
      }
    });
  });
});
