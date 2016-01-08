var createPool = require('../').createPool;
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var db = 'dbname = postgres';
var sql = fs.readFileSync(path.join(__dirname, 'test.sql'));

var pool = createPool({db: db});

var execSQL = function (db, command, callback) {
  pool.acquire(function (err, client) {
    client.query(command).each(function(err, finished, columns, values, index) {
      callback(err, finished, columns, values, index);

      if (finished) {
        pool.release(client);
      }
    });
  });
};

describe('minipg', function () {
  it('should query the database', function (done) {
    var db = 'dbname = postgres';

    execSQL(db, sql, function (err, finished, columns, values, index) {
      if (finished) {
        assert.equal(columns.length, 1);
        assert.equal(values, null);
        assert.equal(index, 3999);
        done();
      }
    });
  });

  it('should return errors', function (done) {
    var db = 'dbname = postgres';

    execSQL(db, 'sele', function (err, finished, columns, values, index) {
      if (finished) {
        assert.equal(columns, null);
        assert.equal(values, null);
        assert.equal(index, -1);
        assert.equal(err.message, 'ERROR:  syntax error at or near "sele"\nLINE 1: sele\n        ^\n');
        assert.equal(err.primary, 'syntax error at or near "sele"');
        assert.equal(err.severity, 'ERROR');
        assert.equal(err.position, '1');
        done();
      }
    });
  });

  it('should work properly for empty result sets', function (done) {
    var db = 'dbname = postgres';

    execSQL(db, 'SELECT 1::int AS count WHERE 1 = 0', function (err, finished, columns, values, index) {
      if (finished) {
        assert.equal(columns.length, 1);
        assert.equal(values, null);
        assert.equal(index, -1);
        done();
      }
    });
  });
});
