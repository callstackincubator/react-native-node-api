#include <jni.h>

#include <ReactCommon/CxxTurboModuleUtils.h>

#include <CxxNodeApiHostModule.hpp>
#include <WeakNodeApiInjector.hpp>

// Called when the library is loaded
jint JNI_OnLoad(JavaVM *vm, void *reserved) {
  callstack::react_native_node_api::injectIntoWeakNodeApi();
  // Register the C++ TurboModule
  facebook::react::registerCxxModuleToGlobalModuleMap(
      callstack::react_native_node_api::CxxNodeApiHostModule::kModuleName,
      [](std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
        return std::make_shared<
            callstack::react_native_node_api::CxxNodeApiHostModule>(jsInvoker);
      });
  return JNI_VERSION_1_6;
}
