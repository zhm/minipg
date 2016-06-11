#ifndef __CONNECT_WORKER_H__
#define __CONNECT_WORKER_H__

#include <nan.h>
#include "client.h"

class ConnectWorker : public Nan::AsyncWorker {
 public:
  ConnectWorker(Nan::Callback *callback, Client *client, std::string connectionString);

  virtual ~ConnectWorker();

  void Execute() override;

 private:
  Client *client_;

  std::string connectionString_;
};

#endif
