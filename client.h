#ifndef __CLIENT_H__
#define __CLIENT_H__

#include <map>

#include <libpq-fe.h>
#include <nan.h>
#include <uv.h>

class ConnectWorker;

class Client : public Nan::ObjectWrap {
public:
  static void Init(v8::Local<v8::Object> exports);

private:
  friend class ConnectWorker;

  explicit Client();

  ~Client();

  static NAN_METHOD(New);

  static NAN_METHOD(Connect);

  static NAN_METHOD(Query);

  static NAN_METHOD(GetResult);

  static NAN_METHOD(GetResults);

  static NAN_METHOD(GetResultsAsync);

  static NAN_METHOD(Close);

  static NAN_METHOD(IsFinished);

  static NAN_METHOD(LastError);

  static NAN_METHOD(SetNoticeProcessor);

  static Nan::Persistent<v8::Function> constructor;

  void Close();

  void SetLastError(PGresult *result);

  void SetResultErrorField(const char *key, const PGresult *result, int fieldCode);

  v8::Local<v8::Value> ProcessSingleResult(bool returnMetadata);

  v8::Local<v8::Value> ProcessSingleResultAsync(bool returnMetadata);

  static v8::Local<v8::Object> CreateResult(PGresult *result, bool includeValues, bool includeMetadata);

  static void NoticeProcessor(void *arg, const char *message);

  static void SocketReadCallback(uv_poll_t *handle, int status, int events);

  void ProcessAvailableResults();

  PGconn *connection_;

  Nan::Callback *noticeProcessor_;

  std::string lastErrorMessage_;

  std::map<std::string, std::string> lastError_;

  bool finished_;

  bool busy_;

  uv_poll_t *resultsPollHandle_;

  Nan::Persistent<v8::Array> results_;

  Nan::Callback callback_;

  bool returnMetadata_;

  int resultCount_;

  /* class ResultsContext { */
  /* public: */
  /*   Nan::Callback *callback; */
  /*   Nan::Persistent<v8::Array> *results; */
  /*   bool returnMetadata; */
  /* }; */

  /* ResultsContext resultsContext_; */
};

#endif
