unless defined?(@exit_hooks_installed)
  # Setting a flag to avoid running this command on every require
  @exit_hooks_installed = true

  NODE_BINARY ||= ENV["NODE_BINARY"] || `command -v node`.strip
  CLI_COMMAND ||= "'#{NODE_BINARY}' '#{File.join(__dir__, "../dist/node/cli/run.js")}'"
  PATCH_XCODE_PROJECT_COMMAND ||= "#{CLI_COMMAND} patch-xcode-project '#{Pod::Config.instance.installation_root}'"
  
  # Using an at_exit hook to ensure the command is executed after the pod install is complete
  at_exit do
    system(PATCH_XCODE_PROJECT_COMMAND) or raise "Failed to patch the Xcode project"
  end
end
