Pod::UI.warn "!!! PATCHING HERMES WITH NODE-API SUPPORT !!!"

if ENV['RCT_USE_PREBUILT_RNCORE'] == '1'
  raise "React Native Node-API cannot reliably patch JSI when React Native Core is prebuilt."
end

def get_react_native_package
  if caller.any? { |frame| frame.include?("node_modules/react-native-macos/") }
    return "react-native-macos"
  elsif caller.any? { |frame| frame.include?("node_modules/react-native/") }
    return "react-native"
  else
    raise "Unable to determine React Native package from call stack."
  end
end

if ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'].nil?
  VENDORED_HERMES_DIR ||= `npx react-native-node-api vendor-hermes --react-native-package '#{get_react_native_package()}' --silent '#{Pod::Config.instance.installation_root}'`.strip
  # Signal the patched Hermes to React Native
  ENV['BUILD_FROM_SOURCE'] = 'true'
  ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'] = VENDORED_HERMES_DIR
elsif Dir.exist?(ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'])
  # Setting an override path implies building from source
  ENV['BUILD_FROM_SOURCE'] = 'true'
end

if !ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'].empty?
  if Dir.exist?(ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'])
    Pod::UI.info "[Node-API] Using overridden Hermes in #{ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'].inspect}"
  else
    raise "Hermes patching failed: Expected override to exist in #{ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'].inspect}"
  end
end
