import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { readInfoPlist } from "./apple";
import { setupTempDirectory } from "../test-utils";

describe("apple", () => {
  describe("Info.plist lookup", () => {
    it("should find Info.plist files in unversioned frameworks", async (context) => {
      const infoPlistContents = `<?xml version="1.0" encoding="UTF-8"?>...`;
      const infoPlistSubPath = "Info.plist";
      const tempDirectoryPath = setupTempDirectory(context, {
        [infoPlistSubPath]: infoPlistContents,
      });

      const result = await readInfoPlist(tempDirectoryPath);

      assert.strictEqual(result.contents, infoPlistContents);
      assert.strictEqual(
        result.infoPlistPath,
        path.join(tempDirectoryPath, infoPlistSubPath),
      );
    });

    it("should find Info.plist files in versioned frameworks", async (context) => {
      const infoPlistContents = `<?xml version="1.0" encoding="UTF-8"?>...`;
      const infoPlistSubPath = "Versions/Current/Resources/Info.plist";
      const tempDirectoryPath = setupTempDirectory(context, {
        [infoPlistSubPath]: infoPlistContents,
      });

      const result = await readInfoPlist(tempDirectoryPath);

      assert.strictEqual(result.contents, infoPlistContents);
      assert.strictEqual(
        result.infoPlistPath,
        path.join(tempDirectoryPath, infoPlistSubPath),
      );
    });

    it("should throw if Info.plist is missing from framework", async (context) => {
      const tempDirectoryPath = setupTempDirectory(context, {});

      await assert.rejects(
        async () => readInfoPlist(tempDirectoryPath),
        /Unable to read Info.plist for framework at path ".*?", as an Info.plist file couldn't be found./,
      );
    });
  });
});
