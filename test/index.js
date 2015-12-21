var Client = require('../');
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var sql = fs.readFileSync(path.join(__dirname, 'test.sql'));

var execSQL = function (db, command, callback) {
  var client = new Client().connect(db);
  client.query(command).each(callback);
};

describe('minipg', function () {
  it('should query the database', function (done) {
    var db = 'dbname = postgres';

    execSQL(db, sql, function (err, row, index) {
      if (row == null) {
        assert.equal(index, 3999);
        done();
      }
    });
  });

  it('should return errors', function (done) {
    var db = 'dbname = postgres';

    execSQL(db, 'sele', function (err, row, index) {
      assert.equal(err, 'ERROR:  syntax error at or near "sele"\nLINE 1: sele\n        ^\n');
      done();
    });
  });
});
