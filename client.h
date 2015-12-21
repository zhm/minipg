#ifndef __CLIENT_H__
#define __CLIENT_H__

#include <libpq-fe.h>
#include <nan.h>

class Client : public Nan::ObjectWrap {
public:
  static void Init(v8::Local<v8::Object> exports);

private:
  explicit Client();

  ~Client();

  static NAN_METHOD(New);

  static NAN_METHOD(Connect);

  static NAN_METHOD(Query);

  static NAN_METHOD(GetResult);

  static NAN_METHOD(Close);

  static NAN_METHOD(IsFinished);

  static NAN_METHOD(LastError);

  static Nan::Persistent<v8::Function> constructor;

  void Close();

  void SetLastError();

  static v8::Local<v8::Object> CreateResult(PGresult *result, bool includeMetadata);

  PGconn *connection_;

  std::string lastError_;

  bool finished_;
};

#endif
