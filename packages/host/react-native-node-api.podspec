require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

require_relative "./scripts/patch-hermes"
require_relative "./scripts/patch-xcode-project"

if ENV['RCT_NEW_ARCH_ENABLED'] == '0'
  Pod::UI.warn "React Native Node-API doesn't support the legacy architecture (but RCT_NEW_ARCH_ENABLED == '0')"
end

Pod::Spec.new do |s|
  s.name         = package["name"]
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.source       = { :git => "https://github.com/callstackincubator/react-native-node-api.git", :tag => "#{s.version}" }

  s.source_files = "apple/**/*.{h,m,mm}", "cpp/**/*.{hpp,cpp,c,h}"

  s.dependency "weak-node-api"

  # Use install_modules_dependencies helper to install the dependencies (requires React Native version >=0.71.0).
  # See https://github.com/facebook/react-native/blob/febf6b7f33fdb4904669f99d795eba4c0f95d7bf/scripts/cocoapods/new_architecture.rb#L79.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    raise "This version of React Native is too old for React Native Node-API."
  end
end