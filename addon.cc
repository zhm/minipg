#include "client.h"

using v8::FunctionTemplate;

NAN_MODULE_INIT(Init) {
  Client::Init(target);
}

NODE_MODULE(addon, Init)
