"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var Cursor = exports["default"] = /*#__PURE__*/function () {
  function Cursor(client) {
    _classCallCheck(this, Cursor);
    this.client = client;
    this.batchOffset = 0;
    this.batchStart = 0;
    this.batch = [];
    this.index = 0;
    this.columns = null;
    this.finished = false;
    this.needsMetadata = true;
  }
  return _createClass(Cursor, [{
    key: "each",
    value: function each(callback) {
      var _this = this;
      this.next(function (err, _ref) {
        var finished = _ref.finished,
          columns = _ref.columns,
          values = _ref.values,
          index = _ref.index,
          client = _ref.client;
        var done = function done() {
          if (!finished) {
            _this.each(callback);
          }
        };
        callback(err, {
          finished: finished,
          columns: columns,
          values: values,
          index: index,
          client: client,
          done: done
        });
      });
    }
  }, {
    key: "eachBatch",
    value: function eachBatch(callback) {
      var _this2 = this;
      this.nextBatch(function () {
        var done = function done() {
          _this2.index += _this2.batch.length;
          if (!_this2.finished) {
            _this2.eachBatch(callback);
          }
        };

        /* eslint-disable callback-return */
        callback(_this2.error, {
          finished: _this2.finished,
          columns: _this2.columns,
          values: _this2.batch,
          index: _this2.index,
          client: _this2.client,
          done: done
        });
        /* eslint-enable callback-return */
      });
    }
  }, {
    key: "next",
    value: function next(callback) {
      var _this3 = this;
      this._index = this._index != null ? this._index : 0;
      var processResult = function processResult() {
        var values = null;
        if (_this3.batch.length) {
          var row = _this3.batch[_this3.batchOffset];
          _this3.batchOffset += 1;
          values = row ? row.values : null;
        }

        /* eslint-disable callback-return */
        callback(_this3.error, {
          finished: _this3.finished && _this3.batchOffset === _this3.batch.length,
          columns: _this3.columns,
          values: values,
          index: _this3._index,
          client: _this3.client
        });
        _this3._index++;
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
  }, {
    key: "nextBatch",
    value: function nextBatch(callback) {
      var _this4 = this;
      if (this.needsMetadata) {
        this.index = 0;
        this.columns = null;
      }
      this.client.getResults(this.needsMetadata, function (results) {
        _this4.needsMetadata = false;
        _this4.batch = results;
        _this4.batchOffset = 0;
        _this4.finished = _this4.client.nativeClient.finished();
        var hasResult = results && results.length;
        var hasColumns = hasResult && results[0] && results[0].columns;

        // results == [ null ]
        var emptyResultSet = hasResult && results[results.length - 1] == null;

        // results == [ ..., {} ]
        var endOfResultSet = hasResult && results[results.length - 1] && results[results.length - 1].values == null;
        if (hasColumns) {
          _this4.batchStart = 0;
          _this4.columns = results[0].columns;
        }

        // There are several possible states here because the client supports
        // multiple result sets in a single query and the complexity that batching adds.
        //
        // finished?               -> we are done, don't do anything
        // results === []          -> it's the signal of finished result set
        // results === [ null ]    -> a query that had no result set all (no column def, just a command like CREATE TABLE)
        // results === [ ..., {} ] -> the end of a result set has a {} at the end, note that this is NOT the end
        //                            of the entire cursor stream because there might be more SELECT queries in the command
        //                            text. If there are, this section below resets the index and the metadata flag so
        //                            that the next call to getResults will request the column metadata of the next query.
        //                            This is important when, for example, there are 2 completely different SELECT statements
        //                            in the command text. In that case we need to ask for metadata twice.
        if (!_this4.finished && (emptyResultSet || endOfResultSet)) {
          _this4.needsMetadata = true;
        }
        var error = _this4.client.lastError;
        if (error) {
          _this4.error = error;
        }

        /* eslint-disable callback-return */
        callback();
        /* eslint-enable callback-return */

        if (results) {
          _this4.batchStart += results.length;
        }
        if (endOfResultSet) {
          _this4.batchStart = 0;
        }
      });
    }
  }]);
}();
//# sourceMappingURL=cursor.js.map