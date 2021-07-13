# minipg [![Build Status](https://www.travis-ci.com/zhm/minipg.svg?branch=master)](https://www.travis-ci.com/zhm/minipg)

High performance libpq bindings. The main feature is [single row mode](http://www.postgresql.org/docs/9.4/static/libpq-single-row-mode.html) to support massive result sets without consuming the entire result set into memory. [node-postgres](https://github.com/brianc/node-postgres) is the standard postgres library, but it requires the entire result set to be read into memory before processing it. There is also [pg-cursor](https://github.com/brianc/node-pg-cursor) on top of it, which helps, but it relies on server-side cursors (portals) which aren't compatible in all scenarios where session-level postgres features don't work (e.g. a production system running pgbouncer connection pooling).

This is not a fully functional postgres client, but it could be one day. It's still in early development.

## Installation

```sh
npm install minipg
```

## Example

```js
import { Client } from 'minipg';

const client = new Client().connect('dbname = postgres');

const sql = 'SELECT generate_series(1, 4000000000)';

// query an essentially infinite series of results
client.query(sql).each(function(err, finished, columns, row, index) {
  // `err` is a possible error message
  // `finished` indicates that the iteration is complete
  // `columns` an object containing the column definitions
  // `row` is the row object with the row data in it
  // `index` is the index of this row in the result set
  console.log(index);

  if (finished) {
    // the end was reached
    client.close();
  }
});
```
