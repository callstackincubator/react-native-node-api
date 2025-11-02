import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import fs from "node:fs";
import cp from "node:child_process";

import {
  linkFlatFramework,
  readAndParsePlist,
  readFrameworkInfo,
  readXcframeworkInfo,
  restoreFrameworkLinks,
} from "./apple";
import { setupTempDirectory } from "../test-utils";

describe("apple", { skip: process.platform !== "darwin" }, () => {
  describe("readInfoPlist", () => {
    it("should read Info.plist contents, plus extra keys not in schema", async (context) => {
      const infoPlistContents = `
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
          <dict>
            <key>CFBundleExecutable</key>
            <string>ExecutableFileName</string>
            <key>CFBundlePackageType</key>
            <string>FMWK</string>
            <key>CFBundleInfoDictionaryVersion</key>
            <string>6.0</string>
          </dict>
        </plist>
      `;
      const infoPlistSubPath = "Info.plist";
      const tempDirectoryPath = setupTempDirectory(context, {
        [infoPlistSubPath]: infoPlistContents,
      });
      const infoPlistPath = path.join(tempDirectoryPath, infoPlistSubPath);

      const contents = await readAndParsePlist(infoPlistPath);
      assert.deepEqual(contents, {
        CFBundleExecutable: "ExecutableFileName",
        CFBundlePackageType: "FMWK",
        CFBundleInfoDictionaryVersion: "6.0",
      });
    });

    it("should throw if Info.plist doesn't exist", async (context) => {
      const tempDirectoryPath = setupTempDirectory(context, {});
      const infoPlistPath = path.join(tempDirectoryPath, "Info.plist");

      await assert.rejects(
        () => readAndParsePlist(infoPlistPath),
        /Expected an Info.plist/,
      );
    });
  });

  describe("readXcframeworkInfo", () => {
    it("should read xcframework Info.plist contents, plus extra keys not in schema", async (context) => {
      const tempDirectoryPath = setupTempDirectory(context, {
        "foo.xcframework": {
          "Info.plist": `
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0">
            <dict>
              <key>AvailableLibraries</key>
              <array>
                <dict>
                  <key>BinaryPath</key>
                  <string>hello.framework/hello</string>
                  <key>LibraryIdentifier</key>
                  <string>tvos-arm64</string>
                  <key>LibraryPath</key>
                  <string>hello.framework</string>
                  <key>SupportedArchitectures</key>
                  <array>
                    <string>arm64</string>
                  </array>
                  <key>SupportedPlatform</key>
                  <string>tvos</string>
                </dict>
              </array>
              <key>CFBundlePackageType</key>
              <string>XFWK</string>
              <key>XCFrameworkFormatVersion</key>
              <string>1.0</string>
            </dict>
            </plist>
          `,
        },
      });

      const result = await readXcframeworkInfo(
        path.join(tempDirectoryPath, "foo.xcframework", "Info.plist"),
      );

      assert.deepEqual(result, {
        AvailableLibraries: [
          {
            BinaryPath: "hello.framework/hello",
            LibraryIdentifier: "tvos-arm64",
            LibraryPath: "hello.framework",
            SupportedArchitectures: ["arm64"],
            SupportedPlatform: "tvos",
          },
        ],
        CFBundlePackageType: "XFWK",
        XCFrameworkFormatVersion: "1.0",
      });
    });
  });

  describe("readFrameworkInfo", () => {
    it("should read framework Info.plist contents, plus extra keys not in schema", async (context) => {
      const tempDirectoryPath = setupTempDirectory(context, {
        "foo.framework": {
          "Info.plist": `
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0">
              <dict>
                <key>CFBundlePackageType</key>
                <string>FMWK</string>
                <key>CFBundleInfoDictionaryVersion</key>
                <string>6.0</string>
                <key>CFBundleExecutable</key>
                <string>example-0--hello</string>
                <key>CFBundleIdentifier</key>
                <string>example_0.hello</string>
                <key>CFBundleSupportedPlatforms</key>
                <array>
                  <string>XRSimulator</string>
                </array>
              </dict>
            </plist>
          `,
        },
      });

      const result = await readFrameworkInfo(
        path.join(tempDirectoryPath, "foo.framework", "Info.plist"),
      );

      assert.deepEqual(result, {
        CFBundlePackageType: "FMWK",
        CFBundleInfoDictionaryVersion: "6.0",
        CFBundleExecutable: "example-0--hello",
        CFBundleIdentifier: "example_0.hello",
        CFBundleSupportedPlatforms: ["XRSimulator"],
      });
    });
  });

  describe("linkFlatFramework", () => {
    it("updates an xml plist, preserving extra keys", async (context) => {
      const infoPlistSubPath = "Info.plist";
      const tempDirectoryPath = setupTempDirectory(context, {
        "foo.framework": {
          [infoPlistSubPath]: `
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0">
              <dict>
                <key>CFBundleExecutable</key>
                <string>addon</string>
                <key>CFBundlePackageType</key>
                <string>FMWK</string>
                <key>CFBundleInfoDictionaryVersion</key>
                <string>6.0</string>
                <key>MyExtraKey</key>
                <string>MyExtraValue</string>
              </dict>
            </plist>
          `,
        },
      });

      // Create a dummy binary file
      cp.spawnSync("clang", [
        "-dynamiclib",
        "-o",
        path.join(tempDirectoryPath, "foo.framework", "addon"),
        "-xc",
        "/dev/null",
      ]);

      await linkFlatFramework({
        frameworkPath: path.join(tempDirectoryPath, "foo.framework"),
        newLibraryName: "new-addon-name",
      });

      const contents = await fs.promises.readFile(
        path.join(
          tempDirectoryPath,
          "new-addon-name.framework",
          infoPlistSubPath,
        ),
        "utf-8",
      );
      assert.match(contents, /<\?xml version="1.0" encoding="UTF-8"\?>/);
      assert.match(
        contents,
        /<key>CFBundleExecutable<\/key>\s*<string>new-addon-name<\/string>/,
      );

      // Assert the install name was updated correctly
      const { stdout: otoolOutput } = cp.spawnSync(
        "otool",
        [
          "-L",
          path.join(
            tempDirectoryPath,
            "new-addon-name.framework",
            "new-addon-name",
          ),
        ],
        { encoding: "utf-8" },
      );
      assert.match(
        otoolOutput,
        /@rpath\/new-addon-name.framework\/new-addon-name/,
      );

      // It should preserve extra keys
      assert.match(
        contents,
        /<key>MyExtraKey<\/key>\s*<string>MyExtraValue<\/string>/,
      );
    });

    it("converts a binary plist to xml", async (context) => {
      const tempDirectoryPath = setupTempDirectory(context, {});
      await fs.promises.mkdir(path.join(tempDirectoryPath, "foo.framework"));
      // Write a binary plist file
      const binaryPlistContents = Buffer.from(
        // Generated running "base64 -i <path-to-binary-plist>" on a plist file from a framework in the node-examples package
        "YnBsaXN0MDDfEBUBAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4cICEiIyQiJSYnJChfEBNCdWlsZE1hY2hpbmVPU0J1aWxkXxAZQ0ZCdW5kbGVEZXZlbG9wbWVudFJlZ2lvbl8QEkNGQnVuZGxlRXhlY3V0YWJsZV8QEkNGQnVuZGxlSWRlbnRpZmllcl8QHUNGQnVuZGxlSW5mb0RpY3Rpb25hcnlWZXJzaW9uXxATQ0ZCdW5kbGVQYWNrYWdlVHlwZV8QGkNGQnVuZGxlU2hvcnRWZXJzaW9uU3RyaW5nXxARQ0ZCdW5kbGVTaWduYXR1cmVfEBpDRkJ1bmRsZVN1cHBvcnRlZFBsYXRmb3Jtc18QD0NGQnVuZGxlVmVyc2lvbl8QFUNTUmVzb3VyY2VzRmlsZU1hcHBlZFpEVENvbXBpbGVyXxAPRFRQbGF0Zm9ybUJ1aWxkXkRUUGxhdGZvcm1OYW1lXxARRFRQbGF0Zm9ybVZlcnNpb25aRFRTREtCdWlsZFlEVFNES05hbWVXRFRYY29kZVxEVFhjb2RlQnVpbGRfEBBNaW5pbXVtT1NWZXJzaW9uXlVJRGV2aWNlRmFtaWx5VjI0RzIzMVdFbmdsaXNoVWFkZG9uXxAPZXhhbXBsZV82LmFkZG9uUzYuMFRGTVdLUzEuMFQ/Pz8/oR9fEA9pUGhvbmVTaW11bGF0b3IJXxAiY29tLmFwcGxlLmNvbXBpbGVycy5sbHZtLmNsYW5nLjFfMFYyMkMxNDZfEA9pcGhvbmVzaW11bGF0b3JUMTguMl8QE2lwaG9uZXNpbXVsYXRvcjE4LjJUMTYyMFgxNkM1MDMyYaEpEAEACAA1AEsAZwB8AJEAsQDHAOQA+AEVAScBPwFKAVwBawF/AYoBlAGcAakBvAHLAdIB2gHgAfIB9gH7Af8CBAIGAhgCGQI+AkUCVwJcAnICdwKAAoIAAAAAAAACAQAAAAAAAAAqAAAAAAAAAAAAAAAAAAAChA==",
        "base64",
      );
      await fs.promises.writeFile(
        path.join(tempDirectoryPath, "foo.framework", "Info.plist"),
        binaryPlistContents,
      );

      // Create a dummy binary file
      cp.spawnSync("clang", [
        "-dynamiclib",
        "-o",
        path.join(tempDirectoryPath, "foo.framework", "addon"),
        "-xc",
        "/dev/null",
      ]);

      await linkFlatFramework({
        frameworkPath: path.join(tempDirectoryPath, "foo.framework"),
        newLibraryName: "new-addon-name",
      });

      const contents = await fs.promises.readFile(
        path.join(tempDirectoryPath, "new-addon-name.framework", "Info.plist"),
        "utf-8",
      );
      assert.match(contents, /<\?xml version="1.0" encoding="UTF-8"\?>/);
      assert.match(
        contents,
        /<key>CFBundleExecutable<\/key>\s*<string>new-addon-name<\/string>/,
      );
    });
  });

  describe("restoreFrameworkLinks", () => {
    it("restores a versioned framework", async (context) => {
      const infoPlistContents = `
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
          <dict>
            <key>CFBundlePackageType</key>
            <string>FMWK</string>
            <key>CFBundleInfoDictionaryVersion</key>
            <string>6.0</string>
            <key>CFBundleExecutable</key>
            <string>example-addon</string>
          </dict>
        </plist>
      `;

      const tempDirectoryPath = setupTempDirectory(context, {
        "foo.framework": {
          Versions: {
            A: {
              Resources: {
                "Info.plist": infoPlistContents,
              },
              "example-addon": "",
            },
          },
        },
      });

      const frameworkPath = path.join(tempDirectoryPath, "foo.framework");
      const currentVersionPath = path.join(
        frameworkPath,
        "Versions",
        "Current",
      );
      const binaryLinkPath = path.join(frameworkPath, "example-addon");
      const realBinaryPath = path.join(
        frameworkPath,
        "Versions",
        "A",
        "example-addon",
      );

      async function assertVersionedFramework() {
        const currentStat = await fs.promises.lstat(currentVersionPath);
        assert(
          currentStat.isSymbolicLink(),
          "Expected Current symlink to be restored",
        );
        assert.equal(
          await fs.promises.realpath(currentVersionPath),
          path.join(frameworkPath, "Versions", "A"),
        );

        const binaryStat = await fs.promises.lstat(binaryLinkPath);
        assert(
          binaryStat.isSymbolicLink(),
          "Expected binary symlink to be restored",
        );
        assert.equal(
          await fs.promises.realpath(binaryLinkPath),
          realBinaryPath,
        );
      }

      await restoreFrameworkLinks(frameworkPath);
      await assertVersionedFramework();

      // Calling again to expect a no-op
      await restoreFrameworkLinks(frameworkPath);
      await assertVersionedFramework();
    });

    it("throws on a flat framework", async (context) => {
      const tempDirectoryPath = setupTempDirectory(context, {
        "foo.framework": {
          "Info.plist": `
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0">
              <dict>
                <key>CFBundlePackageType</key>
                <string>FMWK</string>
                <key>CFBundleInfoDictionaryVersion</key>
                <string>6.0</string>
                <key>CFBundleExecutable</key>
                <string>example-addon</string>
              </dict>
            </plist>
          `,
        },
      });

      const frameworkPath = path.join(tempDirectoryPath, "foo.framework");

      await assert.rejects(
        () => restoreFrameworkLinks(frameworkPath),
        /Expected "Versions" directory inside versioned framework/,
      );
    });
  });
});

describe("apple on non-darwin", { skip: process.platform === "darwin" }, () => {
  it("throws", async (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      ["Info.plist"]: '<?xml version="1.0" encoding="UTF-8"?>',
    });

    await assert.rejects(
      () =>
        linkFlatFramework({
          frameworkPath: path.join(tempDirectoryPath, "Info.plist"),
          newLibraryName: "new-addon-name",
        }),
      (err) => {
        assert(err instanceof Error);
        assert.match(
          err.message,
          /Linking Apple addons are only supported on macOS/,
        );
        return true;
      },
    );
  });
});
