Pod::UI.warn "!!! PATCHING HERMES WITH NODE-API SUPPORT !!!"

if ENV['RCT_USE_PREBUILT_RNCORE'] == '1'
  raise "React Native Node-API cannot reliably patch JSI when React Native Core is prebuilt."
end

VENDORED_HERMES_DIR ||= `npx react-native-node-api vendor-hermes --silent '#{Pod::Config.instance.installation_root}'`.strip
if Dir.exist?(VENDORED_HERMES_DIR)
  Pod::UI.info "Hermes vendored into #{VENDORED_HERMES_DIR.inspect}"
else
  raise "Hermes patching failed. Please check the output above for errors."
end

# Signal the patched Hermes to React Native
ENV['BUILD_FROM_SOURCE'] = 'true'
ENV['REACT_NATIVE_OVERRIDE_HERMES_DIR'] = VENDORED_HERMES_DIR
