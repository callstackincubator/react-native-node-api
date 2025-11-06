require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# We need to restore symlinks in the versioned framework directories,
# as these are not preserved when in the archive uploaded to NPM
unless defined?(@restored)
  RESTORE_COMMAND = "node '#{File.join(__dir__, "dist/restore-xcframework-symlinks.js")}'"
  Pod::UI.info("[weak-node-api] ".green + "Restoring symbolic links in Xcframework")
  system(RESTORE_COMMAND) or raise "Failed to restore symlinks in Xcframework"
  # Setting a flag to avoid running this command on every require
  @restored = true
end

Pod::Spec.new do |s|
  s.name         = package["name"]
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.source       = { :git => "https://github.com/callstackincubator/react-native-node-api.git", :tag => "#{s.version}" }

  s.source_files = "generated/*.hpp", "include/*.h"
  s.public_header_files = "generated/*.hpp", "include/*.h"
  s.vendored_frameworks = "build/*/weak-node-api.xcframework"
  
  # Avoiding the header dir to allow for idiomatic Node-API includes
  s.header_dir = nil
end