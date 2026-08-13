Pod::UI.warn "!!! CONFIGURING HERMES WITH NODE-API SUPPORT !!!"

def node_api_react_native_package
  if caller.any? { |frame| frame.include?("node_modules/react-native-macos/") }
    return "react-native-macos"
  elsif caller.any? { |frame| frame.include?("node_modules/react-native/") }
    return "react-native"
  else
    raise "Unable to determine React Native package from call stack."
  end
end

def node_api_run_cli(command, react_native_package)
  args = [
    command,
    "--react-native-package", react_native_package,
    "--silent", Pod::Config.instance.installation_root.to_s
  ].map { |arg| "'#{arg}'" }.join(" ")
  result = `npx react-native-node-api #{args}`.strip
  raise "Hermes setup failed: 'react-native-node-api #{command}' exited with #{$?.exitstatus}" unless $?.success?
  result
end

if ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'].nil? && ENV['HERMES_ENGINE_TARBALL_PATH'].nil?
  react_native_package = node_api_react_native_package()
  # Building from source keeps Hermes inside the Xcode build, where it rebuilds
  # incrementally — the faster loop while iterating on Hermes itself. Otherwise
  # the pinned commit is resolved to an archive built once and reused.
  #
  # react-native-macos stays on the source path: the archive is only produced
  # and exercised for the iOS platforms today.
  if ENV['REACT_NATIVE_NODE_API_HERMES_FROM_SOURCE'].to_s == '1' || react_native_package == "react-native-macos"
    ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'] = node_api_run_cli("vendor-hermes", react_native_package)
  else
    ENV['HERMES_ENGINE_TARBALL_PATH'] = node_api_run_cli("prebuilt-hermes", react_native_package)
  end
end

if ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'] && !ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'].empty?
  if Dir.exist?(ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'])
    Pod::UI.info "[Node-API] Building Hermes from source in #{ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'].inspect}"
  else
    raise "Hermes setup failed: Expected override to exist in #{ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'].inspect}"
  end
elsif ENV['HERMES_ENGINE_TARBALL_PATH'] && !ENV['HERMES_ENGINE_TARBALL_PATH'].empty?
  if File.exist?(ENV['HERMES_ENGINE_TARBALL_PATH'])
    Pod::UI.info "[Node-API] Using prebuilt Hermes from #{ENV['HERMES_ENGINE_TARBALL_PATH'].inspect}"
  else
    raise "Hermes setup failed: Expected prebuilt archive to exist at #{ENV['HERMES_ENGINE_TARBALL_PATH'].inspect}"
  end
end
