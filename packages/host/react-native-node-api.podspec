require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

require_relative "./scripts/patch-hermes"

NODE_PATH ||= `which node`.strip
CLI_COMMAND ||= "'#{NODE_PATH}' '#{File.join(__dir__, "dist/node/cli/run.js")}'"
COPY_FRAMEWORKS_COMMAND ||= "#{CLI_COMMAND} link --apple '#{Pod::Config.instance.installation_root}'"

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
  s.source       = { :git => "https://github.com/callstackincubator/react-native-node-api.git", :tag => "#{s.version}" }

  s.source_files = "apple/**/*.{h,m,mm}", "cpp/**/*.{hpp,cpp,c,h}", "weak-node-api/include/*.h", "weak-node-api/*.hpp"
  s.public_header_files = "weak-node-api/include/*.h"

  s.vendored_frameworks = "auto-linked/apple/*.xcframework", "weak-node-api/weak-node-api.xcframework"
  s.script_phase = {
    :name => 'Copy Node-API xcframeworks',
    :execution_position => :before_compile,
    :script => <<-CMD
      set -e
      #{COPY_FRAMEWORKS_COMMAND}
    CMD
  }

  # Use install_modules_dependencies helper to install the dependencies (requires React Native version >=0.71.0).
  # See https://github.com/facebook/react-native/blob/febf6b7f33fdb4904669f99d795eba4c0f95d7bf/scripts/cocoapods/new_architecture.rb#L79.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    raise "This version of React Native is too old for React Native Node-API."
  end
end