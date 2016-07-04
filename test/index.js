import { createPool } from '../src';

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const db = 'dbname = postgres';
const sql = fs.readFileSync(path.join(__dirname, 'test.sql')).toString();

const pool = createPool({db: db});

const execSQL = (database, command, callback) => {
  pool.acquire((err, client) => {
    if (err) {
      throw err;
    }

    client.query(command).each((err, finished, columns, values, index) => {
      /* eslint-disable callback-return */
      callback(err, finished, columns, values, index);
      /* eslint-enable callback-return */

      if (finished) {
        pool.release(client);
      }
    });
  });
};

describe('minipg', () => {
  it('should query the database', (done) => {
    let lastIndex = 0;
    let lastColumns = null;
    let lastValues = null;

    execSQL(db, sql, (err, finished, columns, values, index) => {
      if (err) {
        throw err;
      }

      if (columns) {
        lastColumns = columns;
      }

      if (values) {
        lastValues = values;
        lastIndex = index;
      }

      if (finished) {
        assert.equal(lastColumns.length, 3);
        assert.equal(lastIndex, 20);
        assert.deepEqual(lastValues, [ '21', '21', '21' ]);
        done();
      }
    });
  });

  it('should return errors', (done) => {
    execSQL(db, 'sele', (err, finished, columns, values, index) => {
      if (finished) {
        assert.equal(columns, null);
        assert.equal(values, null);
        assert.equal(index, 1);
        assert.equal(err.message, 'ERROR:  syntax error at or near "sele"\nLINE 1: sele\n        ^\n');
        assert.equal(err.primary, 'syntax error at or near "sele"');
        assert.equal(err.severity, 'ERROR');
        assert.equal(err.position, '1');
        done();
      }
    });
  });

  it('should work properly for empty result sets', (done) => {
    let lastColumns = null;

    execSQL(db, 'SELECT 1::int AS count WHERE 1 = 0', (err, finished, columns, values, index) => {
      if (err) {
        throw err;
      }

      if (columns) {
        lastColumns = columns;
      }

      if (finished) {
        assert.equal(lastColumns.length, 1);
        assert.equal(values, null);
        assert.equal(index, 0);
        done();
      }
    });
  });

  it('should be able to process notices', (done) => {
    pool.acquire((err, client) => {
      if (err) {
        throw err;
      }

      let warning = null;

      client.setNoticeProcessor((message) => {
        warning = message;
      });

      const noticeSQL = `
DO language plpgsql $$
BEGIN
  RAISE NOTICE 'test notice';
END
$$;`;

      client.query(noticeSQL).each((err, finished, columns, values, index) => {
        if (err) {
          throw err;
        }

        if (finished) {
          assert.equal(warning, 'NOTICE:  test notice\n');
          pool.release(client);
          done();
        }
      });
    });
  });

  it('should error when attempting to connect to a bogus host', function test(done) {
    this.timeout(5000);

    const badPool = createPool({db: 'host = 1.1.1.1 connect_timeout=1'});

    badPool.acquire((err, client) => {
      assert.equal(err.message, 'timeout expired\n');
      done();
    });
  });

  it('should error when attempting to connect to a bogus database', (done) => {
    const badPool = createPool({db: 'dbname = does_not_exist'});

    badPool.acquire((err, client) => {
      assert.equal(err.message, 'FATAL:  database "does_not_exist" does not exist\n');
      done();
    });
  });
});
