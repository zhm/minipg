#include "connect-worker.h"

ConnectWorker::ConnectWorker(Nan::Callback *callback, Client *client, std::string connectionString)
    : AsyncWorker(callback),
      client_(client),
      connectionString_(connectionString)
{}

ConnectWorker::~ConnectWorker()
{}

void ConnectWorker::Execute() {
  client_->connection_ = PQconnectdb(connectionString_.c_str());

  client_->SetLastError(nullptr);

  if (PQstatus(client_->connection_) != CONNECTION_OK) {
    client_->Close();
    SetErrorMessage(client_->lastErrorMessage_.c_str());
    return;
  }

  if (PQsetClientEncoding(client_->connection_, "utf-8") == -1) {
    client_->Close();
    SetErrorMessage("unable to set the client encoding to utf-8");
    return;
  }

  PQsetNoticeProcessor(client_->connection_,
                       Client::NoticeProcessor,
                       client_);
}
