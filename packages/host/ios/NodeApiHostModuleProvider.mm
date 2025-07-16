#import "CxxNodeApiHostModule.hpp"
#import "WeakNodeApiInjector.hpp"

#define USE_CXX_TURBO_MODULE_UTILS 0
#if defined(__has_include)
#if __has_include(<ReactCommon/CxxTurboModuleUtils.h>)
#undef USE_CXX_TURBO_MODULE_UTILS
#define USE_CXX_TURBO_MODULE_UTILS 1
#endif
#endif

#if USE_CXX_TURBO_MODULE_UTILS
#import <ReactCommon/CxxTurboModuleUtils.h>
@interface NodeApiHost : NSObject
#else
#import <ReactCommon/RCTTurboModule.h>
@interface NodeApiHost : NSObject <RCTBridgeModule, RCTTurboModule>
#endif // USE_CXX_TURBO_MODULE_UTILS

@end

@implementation NodeApiHost
#if USE_CXX_TURBO_MODULE_UTILS
+ (void)load {
  callstack::nodeapihost::injectIntoWeakNodeApi();

  facebook::react::registerCxxModuleToGlobalModuleMap(
      callstack::nodeapihost::CxxNodeApiHostModule::kModuleName,
      [](std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
        return std::make_shared<callstack::nodeapihost::CxxNodeApiHostModule>(
            jsInvoker);
      });
}
#else
RCT_EXPORT_MODULE()

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<callstack::nodeapihost::CxxNodeApiHostModule>(
      params.jsInvoker);
}
#endif // USE_CXX_TURBO_MODULE_UTILS

@end