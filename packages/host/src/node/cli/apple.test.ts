import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import fs from "node:fs";
import cp from "node:child_process";

import { linkFlatFramework, readAndParsePlist } from "./apple";
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
