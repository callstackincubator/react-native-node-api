import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  chalk,
  Command,
  Option,
  oraPromise,
  spawn,
  UsageError,
  wrapAction,
  prettyPath,
} from "@react-native-node-api/cli-utils";
import { readPackage } from "read-pkg";

import {
  HERMES_GIT_SHA,
  ensureHermesCheckout,
  reactNativePackageOption,
  resolveReactNativePath,
  silentOption,
} from "./hermes";

const RELEASES_URL =
  "https://github.com/callstackincubator/react-native-node-api/releases/download";

export const DEFAULT_PLATFORMS = ["iphoneos", "iphonesimulator"];

// Passed to Hermes' build-apple-framework.sh, which errors out rather than
// assume one. These match React Native's own podspec declarations.
const DEPLOYMENT_TARGETS = {
  IOS_DEPLOYMENT_TARGET: "15.1",
  MAC_DEPLOYMENT_TARGET: "10.15",
  XROS_DEPLOYMENT_TARGET: "1.0",
};

export const BUILD_TYPES = ["debug", "release"] as const;
export type BuildType = (typeof BUILD_TYPES)[number];

const PRINTABLE_PROPERTIES = ["name", "tag", "url"] as const;

/**
 * Set to opt out of the prebuilt archive and have the Cocoapods integration
 * build Hermes from the vendored source instead — which is what you want while
 * iterating on Hermes itself, since Xcode then rebuilds it incrementally.
 */
export const FROM_SOURCE_ENV_VAR = "REACT_NATIVE_NODE_API_HERMES_FROM_SOURCE";

export function getCacheDirectory() {
  const { REACT_NATIVE_NODE_API_CACHE_PATH, XDG_CACHE_HOME } = process.env;
  if (REACT_NATIVE_NODE_API_CACHE_PATH) {
    return REACT_NATIVE_NODE_API_CACHE_PATH;
  } else if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Caches",
      "react-native-node-api",
    );
  } else {
    return path.join(
      XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "react-native-node-api",
    );
  }
}

export function getPrebuiltDirectory() {
  return path.join(getCacheDirectory(), "hermes-prebuilt");
}

/**
 * Identifies an archive by everything that changes its contents. The React
 * Native version is part of it because Hermes is compiled against that
 * package's ReactCommon/jsi: a JSI mismatch between the framework and the app
 * linking it is an ABI break. The host architecture is part of it because the
 * hermesc in destroot/bin is a native binary for whichever Mac built it, so a
 * host of the other architecture has to build its own rather than download one
 * it cannot execute.
 */
export function getArchiveName({
  reactNativeVersion,
  buildType,
  platforms,
}: {
  reactNativeVersion: string;
  buildType: BuildType;
  platforms: string[];
}) {
  const shortSha = HERMES_GIT_SHA.slice(0, 12);
  // GitHub rewrites every character outside [A-Za-z0-9._-] in a release asset
  // name, so the name has to stay within that set to survive a round-trip.
  const platformSuffix = [...platforms].sort().join("-");
  return `hermes-${shortSha}-rn${reactNativeVersion}-${buildType}-${platformSuffix}-${process.arch}.tar.gz`;
}

export function getReleaseTag() {
  return `hermes-prebuilt-${HERMES_GIT_SHA.slice(0, 12)}`;
}

export function getDownloadUrl(archiveName: string) {
  return `${RELEASES_URL}/${getReleaseTag()}/${encodeURIComponent(archiveName)}`;
}

/**
 * @returns true if the archive was downloaded, false if the release doesn't
 * publish one for this combination (yet).
 */
async function downloadArchive(url: string, archivePath: string) {
  const response = await fetch(url);
  if (response.status === 404) {
    return false;
  } else if (!response.ok) {
    throw new Error(
      `Unexpected response downloading ${url}: ${response.status} ${response.statusText}`,
    );
  }
  const downloadPath = `${archivePath}.download`;
  await fs.promises.writeFile(
    downloadPath,
    Buffer.from(await response.arrayBuffer()),
  );
  // Renaming last keeps a half-written download from passing as a cache hit.
  await fs.promises.rename(downloadPath, archivePath);
  return true;
}

/**
 * Builds the destroot layout React Native's hermes-engine.podspec expects from
 * a prebuilt tarball, and archives it.
 *
 * The per-platform framework builds are delegated to the Hermes checkout's own
 * utils/build-apple-framework.sh, which is the script that knows how to build
 * that particular source tree. Everything around it — the host compiler, the
 * universal XCFramework and the archive — is assembled here.
 */
async function buildArchive({
  reactNativePath,
  archivePath,
  buildType,
  platforms,
  silent,
}: {
  reactNativePath: string;
  archivePath: string;
  buildType: BuildType;
  platforms: string[];
  silent: boolean;
}) {
  const hermesPath = await ensureHermesCheckout({
    reactNativePath,
    force: false,
    silent,
  });
  const hermescPath = path.join(hermesPath, "build_host_hermesc");
  const importHostCompilersPath = path.join(
    hermescPath,
    "ImportHostCompilers.cmake",
  );
  // Hermes is compiled against the app's React Native JSI headers, not its own
  // vendored copy: the framework and the app linking it share jsi::Runtime.
  const jsiPath = path.join(reactNativePath, "ReactCommon", "jsi");

  const run = (command: string, args: string[]) =>
    spawn(command, args, {
      cwd: hermesPath,
      outputMode: "inherit",
      // Keeps the build log off stdout, which callers parse for the final path.
      stdout: process.stderr,
      env: {
        ...DEPLOYMENT_TARGETS,
        ...process.env,
        JSI_PATH: jsiPath,
        BUILD_TYPE: buildType === "debug" ? "Debug" : "Release",
        HERMES_OVERRIDE_HERMESC_PATH: importHostCompilersPath,
      },
    });

  // Configured here rather than by build-apple-framework.sh's
  // build_host_hermesc only so the build type is explicit — the pinned Hermes
  // hard-errors without one. Do not add CMAKE_OSX_ARCHITECTURES: a multi-arch
  // host configure makes llvh's try-compiles fail, down to "Host compiler
  // appears to require libatomic, but cannot find it".
  if (!fs.existsSync(importHostCompilersPath)) {
    await run("cmake", [
      "-S",
      ".",
      "-B",
      hermescPath,
      `-DJSI_DIR=${jsiPath}`,
      "-DCMAKE_BUILD_TYPE=Release",
    ]);
    await run("cmake", [
      "--build",
      hermescPath,
      "--target",
      "hermesc",
      "-j",
      os.availableParallelism().toString(),
    ]);
  }

  for (const platform of platforms) {
    await run("./utils/build-apple-framework.sh", [platform]);
  }

  const frameworksPath = path.join(
    hermesPath,
    "destroot",
    "Library",
    "Frameworks",
  );
  // hermes-engine.podspec vendors macOS as a plain framework and every other
  // platform out of the universal XCFramework, so macosx stays where it is.
  const xcframeworkPlatforms = platforms.filter(
    (platform) => platform !== "macosx",
  );
  const xcframeworkPath = path.join(
    frameworksPath,
    "universal",
    "hermesvm.xcframework",
  );
  if (xcframeworkPlatforms.length > 0 && !fs.existsSync(xcframeworkPath)) {
    await run("xcodebuild", [
      "-create-xcframework",
      ...xcframeworkPlatforms.flatMap((platform) => [
        "-framework",
        path.join(frameworksPath, platform, "hermesvm.framework"),
        "-debug-symbols",
        path.join(frameworksPath, platform, "hermesvm.framework.dSYM"),
      ]),
      "-output",
      xcframeworkPath,
    ]);
    for (const platform of xcframeworkPlatforms) {
      await fs.promises.rm(path.join(frameworksPath, platform), {
        recursive: true,
        force: true,
      });
    }
  }

  // react-native-xcode.sh falls back to destroot/bin/hermesc when
  // HERMES_CLI_PATH is unset, and the podspec deliberately doesn't point that
  // at the hermes-compiler npm package for local tarballs: the compiler has to
  // emit bytecode this VM can read.
  const binPath = path.join(hermesPath, "destroot", "bin");
  await fs.promises.mkdir(binPath, { recursive: true });
  await fs.promises.copyFile(
    path.join(hermescPath, "bin", "hermesc"),
    path.join(binPath, "hermesc"),
  );

  await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });
  // LICENSE rides along so the archive has more than one top-level entry:
  // CocoaPods flattens an archive whose sole entry is a directory, which would
  // strip the destroot/ prefix that every path in hermes-engine.podspec assumes.
  const partialPath = `${archivePath}.partial`;
  await run("tar", ["-czf", partialPath, "destroot", "LICENSE"]);
  // Renaming last keeps an interrupted archive from passing as a cache hit.
  await fs.promises.rename(partialPath, archivePath);
}

export async function resolvePrebuiltHermes({
  reactNativePath,
  buildType,
  platforms,
  download,
  build,
  force,
  silent,
}: {
  reactNativePath: string;
  buildType: BuildType;
  platforms: string[];
  download: boolean;
  build: boolean;
  force: boolean;
  silent: boolean;
}) {
  const { version: reactNativeVersion } = await readPackage({
    cwd: reactNativePath,
  });
  const archiveName = getArchiveName({
    reactNativeVersion,
    buildType,
    platforms,
  });
  const archivePath = path.join(getPrebuiltDirectory(), archiveName);

  if (force) {
    await fs.promises.rm(archivePath, { force: true });
  } else if (fs.existsSync(archivePath)) {
    return archivePath;
  }

  await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });

  if (download) {
    const url = getDownloadUrl(archiveName);
    const downloaded = await oraPromise(downloadArchive(url, archivePath), {
      text: `Downloading prebuilt Hermes from ${chalk.dim(url)}`,
      successText: (published) =>
        published
          ? `Downloaded prebuilt Hermes into ${prettyPath(archivePath)}`
          : "No prebuilt Hermes published for this React Native version",
      failText: (error) =>
        `Failed to download prebuilt Hermes: ${error.message}`,
      isSilent: silent,
    });
    if (downloaded) {
      return archivePath;
    }
  }

  if (!build) {
    throw new UsageError(`Found no prebuilt Hermes archive ${archiveName}`, {
      fix: {
        instructions: `Drop --no-build to build it locally, or set ${chalk.bold(FROM_SOURCE_ENV_VAR)}=1 to build Hermes from source as part of the app build instead.`,
      },
    });
  }

  if (process.platform !== "darwin") {
    throw new UsageError(
      "Building Hermes for Apple platforms requires macOS and Xcode",
    );
  }

  if (!silent) {
    console.error(
      `Building Hermes ${HERMES_GIT_SHA.slice(0, 12)} for ${platforms.join(", ")} — this takes a while, but only once per pinned commit.`,
    );
  }
  await buildArchive({
    reactNativePath,
    archivePath,
    buildType,
    platforms,
    silent,
  });
  return archivePath;
}

function collectPlatform(value: string, previous: string[] | undefined) {
  return [...(previous ?? []), value];
}

export const command = new Command("prebuilt-hermes")
  .description(
    "Resolve an archive of the pinned Hermes, prebuilt for Apple platforms, printing its path",
  )
  .argument("[from]", "Path to a file inside the app package", process.cwd())
  .addOption(silentOption)
  .option(
    "--force",
    "Re-resolve the archive even if it is already cached",
    false,
  )
  .addOption(reactNativePackageOption)
  .addOption(
    new Option("--build-type <type>", "The Hermes build type")
      .choices(BUILD_TYPES)
      .default<BuildType>("debug"),
  )
  .option(
    "--platform <name>",
    `Apple platform to build for, repeatable (default: ${DEFAULT_PLATFORMS.join(", ")})`,
    collectPlatform,
  )
  .option("--no-download", "Don't download a published archive")
  .option(
    "--no-build",
    "Don't build the archive locally when none is published",
  )
  .addOption(
    new Option(
      "--print <property>",
      "Print a property of the archive instead of resolving it",
    ).choices(PRINTABLE_PROPERTIES),
  )
  .action(
    wrapAction(
      async (
        from,
        {
          silent,
          force,
          reactNativePackage,
          buildType,
          platform,
          download,
          build,
          print,
        },
      ) => {
        const platforms = platform ?? DEFAULT_PLATFORMS;
        const reactNativePath = await resolveReactNativePath(
          from,
          reactNativePackage,
        );
        if (print) {
          const { version: reactNativeVersion } = await readPackage({
            cwd: reactNativePath,
          });
          const archiveName = getArchiveName({
            reactNativeVersion,
            buildType,
            platforms,
          });
          if (print === "name") {
            console.log(archiveName);
          } else if (print === "tag") {
            console.log(getReleaseTag());
          } else {
            console.log(getDownloadUrl(archiveName));
          }
          return;
        }
        const archivePath = await resolvePrebuiltHermes({
          reactNativePath,
          buildType,
          platforms,
          download,
          build,
          force,
          silent,
        });
        console.log(archivePath);
      },
    ),
  );
