import path from "node:path";

/**
 * The name of the emitted prebuild is derived from the artifact on disk (i.e.
 * the target's OUTPUT_NAME) rather than the CMake target name.
 *
 * A project declaring multiple addons has to give its targets unique names,
 * which for generated projects means namespacing them (see gyp-to-cmake's
 * --namespaced-targets). The artifact keeps the name the JS `require` expects,
 * so deriving from it keeps the prebuild's name independent of how the target
 * had to be named to avoid a clash.
 */
export function getArtifactName(artifactPath: string) {
  const basename = path.basename(artifactPath, path.extname(artifactPath));
  // Unless a target clears PREFIX (as the generated addon projects do), CMake
  // prefixes a shared library with "lib". The prebuild is named after the
  // library rather than the file, mirroring how createAndroidLibsDirectory adds
  // the prefix back when copying the library into the libs directory.
  return basename.startsWith("lib") ? basename.slice("lib".length) : basename;
}

export function toDefineArguments(
  declarations: Array<Record<string, string | undefined>>,
) {
  return declarations.flatMap((values) =>
    Object.entries(values)
      .filter(([, definition]) => definition)
      .flatMap(([key, definition]) => ["-D", `${key}=${definition}`]),
  );
}
