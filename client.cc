#include "client.h"
#include "connect-worker.h"

#include <iostream>

static void Log(std::string message) {
  std::cout << message << std::endl;
}

static const int RESULT_BATCH_SIZE = 25;

Nan::Persistent<v8::Function> Client::constructor;

void Client::NoticeProcessor(void *arg, const char *message) {
  Client *client = static_cast<Client *>(arg);

  if (client->noticeProcessor_) {
    v8::Local<v8::Value> argv[] = {
      Nan::New(message).ToLocalChecked()
    };

    client->noticeProcessor_->Call(1, argv);
  } else {
    fprintf(stderr, "%s", message);
  }
}

Client::Client()
  : connection_(nullptr),
    noticeProcessor_(nullptr),
    finished_(true),
    busy_(false),
    resultsPollHandle_(nullptr),
    results_(),
    callback_(),
    returnMetadata_(true),
    resultCount_(0) {
}

Client::~Client() {
  if (noticeProcessor_) {
    delete noticeProcessor_;
    noticeProcessor_ = nullptr;
  }

  Close();
}

void Client::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("Client").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  Nan::SetPrototypeMethod(tpl, "connect", Connect);
  Nan::SetPrototypeMethod(tpl, "query", Query);
  Nan::SetPrototypeMethod(tpl, "close", Close);
  Nan::SetPrototypeMethod(tpl, "getResult", GetResult);
  Nan::SetPrototypeMethod(tpl, "getResults", GetResults);
  Nan::SetPrototypeMethod(tpl, "getResultsAsync", GetResultsAsync);
  Nan::SetPrototypeMethod(tpl, "lastError", LastError);
  Nan::SetPrototypeMethod(tpl, "finished", IsFinished);
  Nan::SetPrototypeMethod(tpl, "setNoticeProcessor", SetNoticeProcessor);

  constructor.Reset(tpl->GetFunction());

  exports->Set(Nan::New("Client").ToLocalChecked(), tpl->GetFunction());
}

NAN_METHOD(Client::New) {
  if (info.IsConstructCall()) {
    Client *obj = new Client();
    obj->Wrap(info.This());
    info.GetReturnValue().Set(info.This());
  } else {
    const int argc = 1;
    v8::Local<v8::Value> argv[argc] = { info[0] };
    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance(argc, argv));
  }
}

NAN_METHOD(Client::Connect) {
  std::string connectionString = *Nan::Utf8String(info[0]);

  Client* client = ObjectWrap::Unwrap<Client>(info.Holder());

  Nan::Callback *callback = new Nan::Callback(info[1].As<v8::Function>());

  Nan::AsyncQueueWorker(new ConnectWorker(callback, client, connectionString));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(Client::Close) {
  Client* client = ObjectWrap::Unwrap<Client>(info.Holder());

  client->Close();

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(Client::LastError) {
  Client* client = ObjectWrap::Unwrap<Client>(info.Holder());

  if (client->lastErrorMessage_.empty()) {
    info.GetReturnValue().SetNull();
  }
  else {
    auto errorObject = Nan::New<v8::Object>();

    for (auto const &entry : client->lastError_) {
      auto &key = entry.first;
      auto &value = entry.second;

      if (!value.empty()) {
        Nan::Set(errorObject, Nan::New(key).ToLocalChecked(),
                              Nan::New(entry.second).ToLocalChecked());
      }
      else {
        Nan::Set(errorObject, Nan::New(key).ToLocalChecked(),
                              Nan::Null());
      }
    }

    info.GetReturnValue().Set(errorObject);
  }
}

NAN_METHOD(Client::IsFinished) {
  Client* client = ObjectWrap::Unwrap<Client>(info.Holder());

  info.GetReturnValue().Set(Nan::New(client->finished_));
}

NAN_METHOD(Client::Query) {
  Client* client = ObjectWrap::Unwrap<Client>(info.Holder());

  Nan::Utf8String commandText(info[0]);

  client->finished_ = false;

  int result = PQsendQuery(client->connection_, *commandText);

  client->SetLastError(nullptr);

  if (result != 1) {
    Nan::ThrowError(client->lastErrorMessage_.c_str());
    return;
  }

  result = PQsetSingleRowMode(client->connection_);

  if (result != 1) {
    Nan::ThrowError(client->lastErrorMessage_.c_str());
    return;
  }

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(Client::SetNoticeProcessor) {
  Client* client = ObjectWrap::Unwrap<Client>(info.Holder());

  if (client->noticeProcessor_) {
    delete client->noticeProcessor_;
    client->noticeProcessor_ = nullptr;
  }

  client->noticeProcessor_ = nullptr;

  if (!info[0]->IsNull() && !info[0]->IsUndefined()) {
    client->noticeProcessor_ = new Nan::Callback(info[0].As<v8::Function>());
  }

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(Client::GetResult) {
  bool returnMetadata = false;

  if (!info[0]->IsUndefined()) {
    returnMetadata = Nan::To<bool>(info[0]).FromMaybe(false);
  }

  Client* client = ObjectWrap::Unwrap<Client>(info.Holder());

  auto result = client->ProcessSingleResult(returnMetadata);

  info.GetReturnValue().Set(result);
}

NAN_METHOD(Client::GetResults) {
  Client* client = ObjectWrap::Unwrap<Client>(info.Holder());

  bool returnMetadata = false;

  if (!info[0]->IsUndefined()) {
    returnMetadata = Nan::To<bool>(info[0]).FromMaybe(false);
  }

  auto results = Nan::New<v8::Array>();

  int index = 0;

  while (true) {
    auto result = client->ProcessSingleResult(returnMetadata && index == 0);

    if (client->finished_) {
      break;
    }

    Nan::Set(results, index, result);

    ++index;

    if (index >= RESULT_BATCH_SIZE) {
      break;
    }
  }

  info.GetReturnValue().Set(results);
}

NAN_METHOD(Client::GetResultsAsync) {
  Client* client = ObjectWrap::Unwrap<Client>(info.Holder());

  bool returnMetadata = false;

  if (!info[0]->IsUndefined()) {
    returnMetadata = Nan::To<bool>(info[0]).FromMaybe(false);
  }

  if (!client->resultsPollHandle_) {
    client->resultsPollHandle_ = new uv_poll_t;
    memset(client->resultsPollHandle_, 0, sizeof(uv_poll_t));
    client->resultsPollHandle_->data = client;

    int socket = PQsocket(client->connection_);

    uv_poll_init_socket(uv_default_loop(), client->resultsPollHandle_, socket);

    if (!uv_is_active((uv_handle_t *)client->resultsPollHandle_)) {
      uv_poll_start(client->resultsPollHandle_, UV_READABLE, &Client::SocketReadCallback);
    }
  }

  client->callback_.SetFunction(info[1].As<v8::Function>());
  client->returnMetadata_ = returnMetadata;

  if (!PQisBusy(client->connection_)) {
    client->ProcessAvailableResults();
  }

  info.GetReturnValue().Set(Nan::Null());
}

void Client::SocketReadCallback(uv_poll_t *handle, int status, int events) {
  Nan::HandleScope scope;

  Client *client = (Client *)handle->data;

  client->ProcessAvailableResults();
}

void Client::ProcessAvailableResults() {
  if (results_.IsEmpty()) {
    results_.Reset(Nan::New<v8::Array>());
    resultCount_ = 0;
  }

  v8::Local<v8::Array> results = Nan::New(results_);

  bool batchReady = false;

  while (true) {
    auto result = ProcessSingleResultAsync(returnMetadata_ && resultCount_ == 0);

    if (finished_) {
      batchReady = true;
      break;
    }

    Nan::Set(results, resultCount_, result);

    resultCount_++;

    if (resultCount_ >= RESULT_BATCH_SIZE) {
      batchReady = true;
      break;
    }
  }

  if (batchReady) {
    if (finished_) {
      uv_poll_stop(resultsPollHandle_);
      delete resultsPollHandle_;
      resultsPollHandle_ = nullptr;
    }

    v8::Local<v8::Value> argv[] = {
      results
    };

    callback_.Call(1, argv);

    results_.Reset();
  }
}

v8::Local<v8::Value> Client::ProcessSingleResultAsync(bool returnMetadata) {
  if (PQconsumeInput(connection_) == 0) {
    SetLastError(nullptr);
    return Nan::Null();
  }

  busy_ = PQisBusy(connection_);

  if (busy_) {
    return Nan::Null();
  }

  return ProcessSingleResult(returnMetadata);
}

v8::Local<v8::Value> Client::ProcessSingleResult(bool returnMetadata) {
  PGresult *result = PQgetResult(connection_);

  if (result == nullptr) {
    finished_ = true;
    return Nan::Null();
  }

  SetLastError(result);

  ExecStatusType status = PQresultStatus(result);

  switch (status) {
    case PGRES_EMPTY_QUERY:
    case PGRES_COMMAND_OK:
      PQclear(result);
      return Nan::Null();
      break;

    case PGRES_BAD_RESPONSE:
    case PGRES_NONFATAL_ERROR:
    case PGRES_FATAL_ERROR:
      PQclear(result);
      return Nan::Null();
      break;

    case PGRES_TUPLES_OK: {
      // If the query returns any rows, they are returned as individual PGresult objects, which look
      // like normal query results except for having status code PGRES_SINGLE_TUPLE instead of
      // PGRES_TUPLES_OK. After the last row, or immediately if the query returns zero rows, a
      // zero-row object with status PGRES_TUPLES_OK is returned; this is the signal that no more
      // rows will arrive. (But note that it is still necessary to continue calling PQgetResult
      // until it returns null.)
      //
      // ref: http://www.postgresql.org/docs/9.4/static/libpq-single-row-mode.html
      //
      // we still want to create a result object so that we can capture the column structure for queries
      // that return 0 rows. If we just hand "null" back to the caller they can't build a correct empty
      // result set.
      auto resultObject = CreateResult(result, false, returnMetadata);

      PQclear(result);

      return resultObject;
      break;
    }

    case PGRES_SINGLE_TUPLE: {
      auto resultObject = CreateResult(result, true, returnMetadata);

      PQclear(result);

      return resultObject;
      break;
    }

    case PGRES_COPY_OUT:
    case PGRES_COPY_IN:
    case PGRES_COPY_BOTH:
      PQclear(result);
      return Nan::Null();
      break;
  }
}

void Client::Close() {
  if (connection_) {
    PQfinish(connection_);
    connection_ = nullptr;
  }
}

inline void Client::SetResultErrorField(const char *key, const PGresult *result, int fieldCode) {
  const char *errorValue = PQresultErrorField(result, fieldCode);

  lastError_[key] = errorValue ? std::string(errorValue) : "";
}

void Client::SetLastError(PGresult *result) {
  if (result) {
    lastErrorMessage_ = PQresultErrorMessage(result);
  }
  else {
    lastErrorMessage_ = PQerrorMessage(connection_);
  }

  if (lastErrorMessage_.empty()) {
    return;
  }

  lastError_["message"] = lastErrorMessage_;
  SetResultErrorField("severity", result, PG_DIAG_SEVERITY);
  SetResultErrorField("state", result, PG_DIAG_SQLSTATE);
  SetResultErrorField("primary", result, PG_DIAG_MESSAGE_PRIMARY);
  SetResultErrorField("detail", result, PG_DIAG_MESSAGE_DETAIL);
  SetResultErrorField("hint", result, PG_DIAG_MESSAGE_HINT);
  SetResultErrorField("position", result, PG_DIAG_STATEMENT_POSITION);
  SetResultErrorField("internalPosition", result, PG_DIAG_INTERNAL_POSITION);
  SetResultErrorField("internalQuery", result, PG_DIAG_INTERNAL_QUERY);
  SetResultErrorField("context", result, PG_DIAG_CONTEXT);
  SetResultErrorField("schema", result, PG_DIAG_SCHEMA_NAME);
  SetResultErrorField("table", result, PG_DIAG_TABLE_NAME);
  SetResultErrorField("column", result, PG_DIAG_COLUMN_NAME);
  SetResultErrorField("dataType", result, PG_DIAG_DATATYPE_NAME);
  SetResultErrorField("constraint", result, PG_DIAG_CONSTRAINT_NAME);
  SetResultErrorField("file", result, PG_DIAG_SOURCE_FILE);
  SetResultErrorField("line", result, PG_DIAG_SOURCE_LINE);
  SetResultErrorField("func", result, PG_DIAG_SOURCE_FUNCTION);
}

v8::Local<v8::Object> Client::CreateResult(PGresult *result, bool includeValues, bool includeMetadata) {
  int fieldCount = PQnfields(result);

  auto resultObject = Nan::New<v8::Object>();
  auto columns = Nan::New<v8::Array>();
  auto values = Nan::New<v8::Array>();

  for (int i = 0; i < fieldCount; ++i) {
    if (includeMetadata) {
      auto column = Nan::New<v8::Object>();

      const char *columnName = PQfname(result, i);
      Oid columnType = PQftype(result, i);
      int columnMod = PQfmod(result, i);
      int columnSize = PQfsize(result, i);
      /* int length = PQgetlength(result, 0, i); */

      Nan::Set(column, Nan::New("name").ToLocalChecked(),
                       Nan::New(columnName).ToLocalChecked());

      Nan::Set(column, Nan::New("type").ToLocalChecked(),
                       Nan::New(columnType));

      Nan::Set(column, Nan::New("mod").ToLocalChecked(),
                       Nan::New(columnMod));

      Nan::Set(column, Nan::New("size").ToLocalChecked(),
                       Nan::New(columnSize));

      Nan::Set(columns, i, column);
    }

    if (includeValues) {
      int isNull = PQgetisnull(result, 0, i);
      const char *value = isNull ? nullptr : PQgetvalue(result, 0, i);

      if (isNull) {
        Nan::Set(values, i, Nan::Null());
      }
      else {
        Nan::Set(values, i, Nan::New(value).ToLocalChecked());
      }
    }
  }

  if (includeMetadata) {
    Nan::Set(resultObject, Nan::New("columns").ToLocalChecked(), columns);
  }

  if (includeValues) {
    Nan::Set(resultObject, Nan::New("values").ToLocalChecked(), values);
  }

  return resultObject;
}
