#include "client.h"

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

  client->SetLastError();

  if (PQstatus(client->connection_) != CONNECTION_OK) {
    client->Close();
    Nan::ThrowError(client->lastError_.c_str());
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

  info.GetReturnValue().Set(Nan::New(client->lastError_).ToLocalChecked());
}

NAN_METHOD(Client::Query) {
  Client* client = ObjectWrap::Unwrap<Client>(info.Holder());

  std::string command = *Nan::Utf8String(info[0]);

  int result = PQsendQuery(client->connection_, command.c_str());

  client->SetLastError();

  if (result != 1) {
    Nan::ThrowError(client->lastError_.c_str());
    return;
  }

  result = PQsetSingleRowMode(client->connection_);

  if (result != 1) {
    Nan::ThrowError(client->lastError_.c_str());
    return;
  }

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(Client::GetResult) {
  Client* client = ObjectWrap::Unwrap<Client>(info.Holder());

  PGresult *result = PQgetResult(client->connection_);

  bool returnMetadata = false;

  if (!info[0]->IsUndefined()) {
    returnMetadata = Nan::To<bool>(info[0]).FromMaybe(false);
  }

  client->SetLastError();

  if (PQresultStatus(result) == PGRES_TUPLES_OK && PQntuples(result) == 0) {
    // After the last row, or immediately if the query returns zero rows,
    // a zero-row object with status PGRES_TUPLES_OK is returned; this is
    // the signal that no more rows will arrive.

    PQclear(result);

    result = PQgetResult(client->connection_);

    if (result != nullptr) {
      client->SetLastError();
      PQclear(result);
      Nan::ThrowError(client->lastError_.c_str());
      return;
    }

    info.GetReturnValue().SetNull();

    return;
  }

  if (PQresultStatus(result) == PGRES_SINGLE_TUPLE) {
    int fieldCount = PQnfields(result);

    auto resultObject = Nan::New<v8::Object>();
    auto columns = Nan::New<v8::Array>();
    auto row = Nan::New<v8::Array>();

    for (int i = 0; i < fieldCount; ++i) {
      if (returnMetadata) {
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

      int isNull = PQgetisnull(result, 0, i);
      const char *value = PQgetvalue(result, 0, i);

      if (isNull) {
        Nan::Set(row, i, Nan::Null());
      }
      else {
        Nan::Set(row, i, Nan::New(value).ToLocalChecked());
      }
    }

    PQclear(result);

    if (returnMetadata) {
      Nan::Set(resultObject, Nan::New("columns").ToLocalChecked(), columns);
    }

    Nan::Set(resultObject, Nan::New("row").ToLocalChecked(), row);

    info.GetReturnValue().Set(resultObject);

    return;
  }
}

void Client::Close() {
  if (connection_) {
    PQfinish(connection_);
    connection_ = nullptr;
  }
}

void Client::SetLastError() {
  if (connection_) {
    lastError_ = PQerrorMessage(connection_);
  }
}
