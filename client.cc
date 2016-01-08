#include "client.h"
#include <iostream>

Nan::Persistent<v8::Function> Client::constructor;

Client::Client() : connection_(nullptr) {
}

Client::~Client() {
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
  Nan::SetPrototypeMethod(tpl, "lastError", LastError);
  Nan::SetPrototypeMethod(tpl, "finished", IsFinished);

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

  client->connection_ = PQconnectdb(connectionString.c_str());

  client->SetLastError(nullptr);

  if (PQstatus(client->connection_) != CONNECTION_OK) {
    client->Close();
    Nan::ThrowError(client->lastErrorMessage_.c_str());
    return;
  }

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

  std::string command = *Nan::Utf8String(info[0]);

  client->finished_ = false;

  int result = PQsendQuery(client->connection_, command.c_str());

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

NAN_METHOD(Client::GetResult) {
  Client* client = ObjectWrap::Unwrap<Client>(info.Holder());

  PGresult *result = PQgetResult(client->connection_);

  if (result == nullptr) {
    client->finished_ = true;
    info.GetReturnValue().SetNull();
    return;
  }

  bool returnMetadata = false;

  if (!info[0]->IsUndefined()) {
    returnMetadata = Nan::To<bool>(info[0]).FromMaybe(false);
  }

  client->SetLastError(result);

  ExecStatusType status = PQresultStatus(result);

  switch (status) {
    case PGRES_EMPTY_QUERY:
    case PGRES_COMMAND_OK:
      PQclear(result);
      info.GetReturnValue().SetNull();
      break;

    case PGRES_BAD_RESPONSE:
    case PGRES_NONFATAL_ERROR:
    case PGRES_FATAL_ERROR:
      PQclear(result);
      info.GetReturnValue().SetNull();
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
      auto resultObject = CreateResult(result, false, returnMetadata);

      PQclear(result);

      info.GetReturnValue().Set(resultObject);
      break;
    }

    case PGRES_SINGLE_TUPLE: {
      auto resultObject = CreateResult(result, true, returnMetadata);

      PQclear(result);

      info.GetReturnValue().Set(resultObject);
      break;
    }

    case PGRES_COPY_OUT:
    case PGRES_COPY_IN:
    case PGRES_COPY_BOTH:
      PQclear(result);
      info.GetReturnValue().SetNull();
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
  char *errorValue = NULL;

  if (result) {
    errorValue = PQresultErrorField(result, fieldCode);
  }

  lastError_[key] = errorValue ? errorValue : "";
}

void Client::SetLastError(PGresult *result) {
  if (connection_) {
    lastErrorMessage_ = PQerrorMessage(connection_);
  }
  else {
    lastErrorMessage_ = "";
  }

  lastError_["message"] = lastErrorMessage_;

  SetResultErrorField("severity", result, PG_DIAG_SEVERITY);
  SetResultErrorField("sqlState", result, PG_DIAG_SQLSTATE);
  SetResultErrorField("messagePrimary", result, PG_DIAG_MESSAGE_PRIMARY);
  SetResultErrorField("messageDetail", result, PG_DIAG_MESSAGE_DETAIL);
  SetResultErrorField("messageHint", result, PG_DIAG_MESSAGE_HINT);
  SetResultErrorField("statementPosition", result, PG_DIAG_STATEMENT_POSITION);
  SetResultErrorField("internalPosition", result, PG_DIAG_INTERNAL_POSITION);
  SetResultErrorField("internalQuery", result, PG_DIAG_INTERNAL_QUERY);
  SetResultErrorField("context", result, PG_DIAG_CONTEXT);
  SetResultErrorField("schemaName", result, PG_DIAG_SCHEMA_NAME);
  SetResultErrorField("tableName", result, PG_DIAG_TABLE_NAME);
  SetResultErrorField("columnName", result, PG_DIAG_COLUMN_NAME);
  SetResultErrorField("dataTypeName", result, PG_DIAG_DATATYPE_NAME);
  SetResultErrorField("constraintName", result, PG_DIAG_CONSTRAINT_NAME);
  SetResultErrorField("sourceFile", result, PG_DIAG_SOURCE_FILE);
  SetResultErrorField("sourceLine", result, PG_DIAG_SOURCE_LINE);
  SetResultErrorField("sourceFunction", result, PG_DIAG_SOURCE_FUNCTION);
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
      const char *value = PQgetvalue(result, 0, i);

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
