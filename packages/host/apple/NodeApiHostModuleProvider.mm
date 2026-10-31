#import "CxxNodeApiHostModule.hpp"
#import "WeakNodeApiInjector.hpp"

#import <ReactCommon/CxxTurboModuleUtils.h>
@interface NodeApiHostPackage : NSObject

@end

@implementation NodeApiHostPackage
+ (void)load {
  callstack::react_native_node_api::injectIntoWeakNodeApi();

  facebook::react::registerCxxModuleToGlobalModuleMap(
      callstack::react_native_node_api::CxxNodeApiHostModule::kModuleName,
      [](std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
        return std::make_shared<
            callstack::react_native_node_api::CxxNodeApiHostModule>(jsInvoker);
      });
}

@end