#import "CxxNodeApiHostModule.hpp"
#import "WeakNodeApiInjector.hpp"

#import <ReactCommon/CxxTurboModuleUtils.h>
@interface NodeApiHost : NSObject

@end

@implementation NodeApiHost
+ (void)load {
  callstack::nodeapihost::injectIntoWeakNodeApi();

  facebook::react::registerCxxModuleToGlobalModuleMap(
      callstack::nodeapihost::CxxNodeApiHostModule::kModuleName,
      [](std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
        return std::make_shared<callstack::nodeapihost::CxxNodeApiHostModule>(
            jsInvoker);
      });
}

@end