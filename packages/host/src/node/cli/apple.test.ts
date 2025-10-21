import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import fs from "node:fs";

import {
  determineInfoPlistPath,
  readInfoPlist,
  updateInfoPlist,
} from "./apple";
import { setupTempDirectory } from "../test-utils";

describe("apple", () => {
  describe("determineInfoPlistPath", () => {
    it("should find Info.plist files in unversioned frameworks", (context) => {
      const infoPlistContents = `<?xml version="1.0" encoding="UTF-8"?>...`;
      const infoPlistSubPath = "Info.plist";
      const tempDirectoryPath = setupTempDirectory(context, {
        [infoPlistSubPath]: infoPlistContents,
      });

      assert.strictEqual(
        determineInfoPlistPath(tempDirectoryPath),
        path.join(tempDirectoryPath, infoPlistSubPath),
      );
    });

    it("should find Info.plist files in versioned frameworks", (context) => {
      const infoPlistContents = `<?xml version="1.0" encoding="UTF-8"?>...`;
      const infoPlistSubPath = "Versions/Current/Resources/Info.plist";
      const tempDirectoryPath = setupTempDirectory(context, {
        [infoPlistSubPath]: infoPlistContents,
      });

      assert.strictEqual(
        determineInfoPlistPath(tempDirectoryPath),
        path.join(tempDirectoryPath, infoPlistSubPath),
      );
    });

    it("should throw if Info.plist is missing from framework", (context) => {
      const tempDirectoryPath = setupTempDirectory(context, {});

      assert.throws(
        () => determineInfoPlistPath(tempDirectoryPath),
        /Unable to locate an Info.plist file within framework./,
      );
    });
  });

  describe("readInfoPlist", () => {
    it("should read Info.plist contents", async (context) => {
      const infoPlistContents = `
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
          <dict>
            <key>CFBundleExecutable</key>
            <string>ExecutableFileName</string>
            <key>CFBundleIconFile</key>
            <string>AppIcon</string>
          </dict>
        </plist>
      `;
      const infoPlistSubPath = "Info.plist";
      const tempDirectoryPath = setupTempDirectory(context, {
        [infoPlistSubPath]: infoPlistContents,
      });
      const infoPlistPath = path.join(tempDirectoryPath, infoPlistSubPath);

      const contents = await readInfoPlist(infoPlistPath);
      assert.deepEqual(contents, {
        CFBundleExecutable: "ExecutableFileName",
        CFBundleIconFile: "AppIcon",
      });
    });

    it("should throw if Info.plist doesn't exist", async (context) => {
      const tempDirectoryPath = setupTempDirectory(context, {});
      const infoPlistPath = path.join(tempDirectoryPath, "Info.plist");

      await assert.rejects(
        () => readInfoPlist(infoPlistPath),
        /Unable to read Info.plist at path/,
      );
    });
  });

  describe("updateInfoPlist", () => {
    it(
      "updates an xml plist",
      { skip: process.platform !== "darwin" },
      async (context) => {
        const infoPlistSubPath = "Info.plist";
        const tempDirectoryPath = setupTempDirectory(context, {
          [infoPlistSubPath]: `
          <?xml version="1.0" encoding="UTF-8"?>
          <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
          <plist version="1.0">
            <dict>
              <key>CFBundleExecutable</key>
              <string>addon</string>
            </dict>
          </plist>
        `,
        });

        await updateInfoPlist({
          frameworkPath: tempDirectoryPath,
          oldLibraryName: "addon",
          newLibraryName: "new-addon-name",
        });

        const contents = await fs.promises.readFile(
          path.join(tempDirectoryPath, infoPlistSubPath),
          "utf-8",
        );
        assert.match(contents, /<\?xml version="1.0" encoding="UTF-8"\?>/);
        assert.match(
          contents,
          /<key>CFBundleExecutable<\/key>\s*<string>new-addon-name<\/string>/,
        );
      },
    );

    it(
      "converts a binary plist to xml",
      { skip: process.platform !== "darwin" },
      async (context) => {
        const tempDirectoryPath = setupTempDirectory(context, {});
        // Write a binary plist file
        const binaryPlistContents = Buffer.from(
          // Generated running "base64 -i <path-to-binary-plist>" on a plist file from a framework in the node-examples package
          "YnBsaXN0MDDfEBUBAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4cICEiIyQiJSYnJChfEBNCdWlsZE1hY2hpbmVPU0J1aWxkXxAZQ0ZCdW5kbGVEZXZlbG9wbWVudFJlZ2lvbl8QEkNGQnVuZGxlRXhlY3V0YWJsZV8QEkNGQnVuZGxlSWRlbnRpZmllcl8QHUNGQnVuZGxlSW5mb0RpY3Rpb25hcnlWZXJzaW9uXxATQ0ZCdW5kbGVQYWNrYWdlVHlwZV8QGkNGQnVuZGxlU2hvcnRWZXJzaW9uU3RyaW5nXxARQ0ZCdW5kbGVTaWduYXR1cmVfEBpDRkJ1bmRsZVN1cHBvcnRlZFBsYXRmb3Jtc18QD0NGQnVuZGxlVmVyc2lvbl8QFUNTUmVzb3VyY2VzRmlsZU1hcHBlZFpEVENvbXBpbGVyXxAPRFRQbGF0Zm9ybUJ1aWxkXkRUUGxhdGZvcm1OYW1lXxARRFRQbGF0Zm9ybVZlcnNpb25aRFRTREtCdWlsZFlEVFNES05hbWVXRFRYY29kZVxEVFhjb2RlQnVpbGRfEBBNaW5pbXVtT1NWZXJzaW9uXlVJRGV2aWNlRmFtaWx5VjI0RzIzMVdFbmdsaXNoVWFkZG9uXxAPZXhhbXBsZV82LmFkZG9uUzYuMFRGTVdLUzEuMFQ/Pz8/oR9fEA9pUGhvbmVTaW11bGF0b3IJXxAiY29tLmFwcGxlLmNvbXBpbGVycy5sbHZtLmNsYW5nLjFfMFYyMkMxNDZfEA9pcGhvbmVzaW11bGF0b3JUMTguMl8QE2lwaG9uZXNpbXVsYXRvcjE4LjJUMTYyMFgxNkM1MDMyYaEpEAEACAA1AEsAZwB8AJEAsQDHAOQA+AEVAScBPwFKAVwBawF/AYoBlAGcAakBvAHLAdIB2gHgAfIB9gH7Af8CBAIGAhgCGQI+AkUCVwJcAnICdwKAAoIAAAAAAAACAQAAAAAAAAAqAAAAAAAAAAAAAAAAAAAChA==",
          "base64",
        );
        const binaryPlistPath = path.join(tempDirectoryPath, "Info.plist");
        await fs.promises.writeFile(binaryPlistPath, binaryPlistContents);

        await updateInfoPlist({
          frameworkPath: tempDirectoryPath,
          oldLibraryName: "addon",
          newLibraryName: "new-addon-name",
        });

        const contents = await fs.promises.readFile(binaryPlistPath, "utf-8");
        assert.match(contents, /<\?xml version="1.0" encoding="UTF-8"\?>/);
        assert.match(
          contents,
          /<key>CFBundleExecutable<\/key>\s*<string>new-addon-name<\/string>/,
        );
      },
    );

    it(
      "throws when not on darwin",
      { skip: process.platform === "darwin" },
      async (context) => {
        const tempDirectoryPath = setupTempDirectory(context, {
          ["Info.plist"]: '<?xml version="1.0" encoding="UTF-8"?>',
        });

        await assert.rejects(
          () =>
            updateInfoPlist({
              frameworkPath: tempDirectoryPath,
              oldLibraryName: "addon",
              newLibraryName: "new-addon-name",
            }),
          (err) => {
            assert(err instanceof Error);
            assert.match(err.message, /Failed to convert Info.plist at path/);
            assert(err.cause instanceof Error);
            assert.match(
              err.cause.message,
              /Updating Info.plist files are not supported on this platform/,
            );
            return true;
          },
        );
      },
    );
  });
});
