#include "connect-worker.h"

ConnectWorker::ConnectWorker(Nan::Callback *callback, Client *client, std::string connectionString)
    : AsyncWorker(callback),
      client_(client),
      connectionString_(connectionString)
{}

ConnectWorker::~ConnectWorker()
{}

void ConnectWorker::Execute() {
  PGconn *connection = PQconnectdb(connectionString_.c_str());

  client_->SetLastError(nullptr);

  if (PQstatus(connection) != CONNECTION_OK) {
    client_->Close();
    SetErrorMessage(client_->lastErrorMessage_.c_str());
    return;
  }

  if (PQsetClientEncoding(connection, "utf-8") == -1) {
    client_->Close();
    SetErrorMessage("unable to set the client encoding to utf-8");
    return;
  }

  PQsetNoticeProcessor(connection,
                       Client::NoticeProcessor,
                       client_);

  client_->connection_ = connection;
}
