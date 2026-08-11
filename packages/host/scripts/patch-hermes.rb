Pod::UI.warn "!!! CONFIGURING HERMES WITH NODE-API SUPPORT !!!"

if ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'].nil?
  def get_react_native_package
    if caller.any? { |frame| frame.include?("node_modules/react-native-macos/") }
      return "react-native-macos"
    elsif caller.any? { |frame| frame.include?("node_modules/react-native/") }
      return "react-native"
    else
      raise "Unable to determine React Native package from call stack."
    end
  end

  VENDORED_HERMES_DIR ||= `npx react-native-node-api vendor-hermes --react-native-package '#{get_react_native_package()}' --silent '#{Pod::Config.instance.installation_root}'`.strip
  ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'] = VENDORED_HERMES_DIR
end

if ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'] && !ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'].empty?
  if Dir.exist?(ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'])
    Pod::UI.info "[Node-API] Using overridden Hermes in #{ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'].inspect}"
  else
    raise "Hermes setup failed: Expected override to exist in #{ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'].inspect}"
  end
end
