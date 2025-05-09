require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

require_relative "./scripts/patch-hermes"

NODE_PATH ||= `which node`.strip
CLI_COMMAND ||= "'#{NODE_PATH}' '#{File.join(__dir__, "dist/node/cli/run.js")}'"
STRIP_PATH_SUFFIX ||= ENV['NODE_API_MODULES_STRIP_PATH_SUFFIX'] === "true"
COPY_FRAMEWORKS_COMMAND ||= "#{CLI_COMMAND} link --apple '#{Pod::Config.instance.installation_root}' #{STRIP_PATH_SUFFIX ? '--strip-path-suffix' : ''}"

# We need to run this now to ensure the xcframeworks are copied vendored_frameworks are considered
XCFRAMEWORKS_DIR ||= File.join(__dir__, "xcframeworks")
unless defined?(@xcframeworks_copied)
  puts "Executing #{COPY_FRAMEWORKS_COMMAND}"
  system(COPY_FRAMEWORKS_COMMAND) or raise "Failed to copy xcframeworks"
  # Setting a flag to avoid running this command on every require
  @xcframeworks_copied = true
end

Pod::Spec.new do |s|
  s.name         = package["name"]
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/callstackincubator/react-native-node-api-modules.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm}", "cpp/**/*.{hpp,cpp,c,h}", "include/*.h"
  s.public_header_files = "include/*.h"

  s.vendored_frameworks = "auto-linked/apple/*.xcframework", "weak-node-api/libweak-node-api.xcframework"
  s.script_phase = {
    :name => 'Copy Node-API xcframeworks',
    :execution_position => :before_compile,
    :script => <<-CMD
      set -e
      #{COPY_FRAMEWORKS_COMMAND}
    CMD
  }

  # Use install_modules_dependencies helper to install the dependencies if React Native version >=0.71.0.
  # See https://github.com/facebook/react-native/blob/febf6b7f33fdb4904669f99d795eba4c0f95d7bf/scripts/cocoapods/new_architecture.rb#L79.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
    # Don't install the dependencies when we run `pod install` in the old architecture.
    if ENV['RCT_NEW_ARCH_ENABLED'] == '1' then
      # TODO: Re-visit these dependencies and flags and remove them if not needed.
      s.compiler_flags = folly_compiler_flags + " -DRCT_NEW_ARCH_ENABLED=1"
      s.pod_target_xcconfig    = {
          "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/boost\"",
          "OTHER_CPLUSPLUSFLAGS" => "-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1",
          "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
      }
      s.dependency "React-Codegen"
      s.dependency "RCT-Folly"
      s.dependency "RCTRequired"
      s.dependency "RCTTypeSafety"
      s.dependency "ReactCommon/turbomodule/core"
    end
  end
end