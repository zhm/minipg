export default class Cursor {
  constructor(client) {
    this.client = client;
    this.batchOffset = 0;
    this.batch = [];
    this.index = 0;
    this.columns = null;
    this.finished = false;
  }

  each(callback) {
    this.next((err, finished, columns, row, index) => {
      /* eslint-disable callback-return */
      callback(err, finished, columns, row, index);
      /* eslint-enable callback-return */

      if (!finished) {
        this.each(callback);
      }
    });
  }

  eachBatch(callback) {
    this.nextBatch(() => {
      /* eslint-disable callback-return */
      callback(this.error,
               this.finished,
               this.columns,
               this.batch,
               this.index);
      /* eslint-enable callback-return */

      console.log('incr2');
      this.index += this.batch.length;

      if (!this.finished) {
        this.eachBatch(callback);
      }
    });
  }

  next(callback) {
    const processResult = () => {
      let values = null;

      if (this.batch.length) {
        const row = this.batch[this.batchOffset];

        this.batchOffset += 1;

        if (row && row.values) {
          this.index += 1;
        }

        values = row ? row.values : null;
      }

      /* eslint-disable callback-return */
      callback(this.error,
               this.finished && this.batchOffset === this.batch.length,
               this.columns,
               values,
               this.index);
      /* eslint-enable callback-return */
    };

    if (this.batchOffset < this.batch.length) {
      if (this.batchOffset % 1000 === 0) {
        process.nextTick(processResult);
      } else {
        processResult();
      }
    } else {
      // we need to fetch the next batch into memory
      this.nextBatch(processResult);
    }
  }

  nextBatch(callback) {
    const returnMetadata = (this.index === 0);

    this.client.getResults(returnMetadata, (results) => {
      this.batch = results;
      this.batchOffset = 0;
      this.finished = this.client.nativeClient.finished();

      if (!this.columns) {
        this.columns = results && results.length && results[0] && results[0].columns ? results[0].columns : null;
      }

      const error = this.client.lastError;

      if (error) {
        this.error = error;
      }

      callback();
    });
  }
}
