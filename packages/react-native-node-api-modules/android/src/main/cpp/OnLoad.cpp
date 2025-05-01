#include <jni.h>

#include <ReactCommon/CxxTurboModuleUtils.h>

#include <CxxNodeApiHostModule.hpp>

// Called when the library is loaded
jint JNI_OnLoad(JavaVM *vm, void *reserved) {
  // Register the C++ TurboModule
  facebook::react::registerCxxModuleToGlobalModuleMap(
      callstack::nodeapihost::CxxNodeApiHostModule::kModuleName,
      [](std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
        return std::make_shared<callstack::nodeapihost::CxxNodeApiHostModule>(
            jsInvoker);
      });
  return JNI_VERSION_1_6;
}
