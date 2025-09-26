import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, type TestContext } from "node:test";

import {
  findCurrentReplyIndexPath,
  readIndex,
  readCodeModel,
  readTarget,
  readCache,
  readCmakeFiles,
  readToolchains,
} from "./reply.js";
import {
  TargetV2_0,
  TargetV2_1,
  TargetV2_2,
  TargetV2_5,
  TargetV2_6,
  TargetV2_7,
  TargetV2_8,
  CmakeFilesV1_0,
  CmakeFilesV1_1,
} from "./schemas.js";

function createMockReplyDirectory(
  context: TestContext,
  replyFiles: [string, Record<string, unknown>][],
) {
  const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "test-"));

  for (const [fileName, content] of replyFiles) {
    const filePath = path.join(tmpPath, fileName);
    fs.writeFileSync(filePath, JSON.stringify(content), {
      encoding: "utf-8",
    });
  }

  context.after(() => {
    fs.rmSync(tmpPath, { recursive: true, force: true });
  });

  return tmpPath;
}

describe("findCurrentReplyIndexPath", () => {
  it("returns the correct path when only index files are present", async function (context) {
    const tmpPath = createMockReplyDirectory(context, [
      ["index-a.json", {}],
      ["index-b.json", {}],
    ]);
    const result = await findCurrentReplyIndexPath(tmpPath);
    assert.strictEqual(result, path.join(tmpPath, "index-b.json"));
  });

  it("returns the correct path when only error files are present", async function (context) {
    const tmpPath = createMockReplyDirectory(context, [
      ["error-a.json", {}],
      ["error-b.json", {}],
    ]);
    const result = await findCurrentReplyIndexPath(tmpPath);
    assert.strictEqual(result, path.join(tmpPath, "error-b.json"));
  });

  it("returns the correct path when both index and error files are present", async function (context) {
    const tmpPath = createMockReplyDirectory(context, [
      ["index-a.json", {}],
      ["error-b.json", {}],
    ]);
    const result = await findCurrentReplyIndexPath(tmpPath);
    assert.strictEqual(result, path.join(tmpPath, "error-b.json"));
  });

  it("returns the correct path when both index and error files are present (reversed)", async function (context) {
    const tmpPath = createMockReplyDirectory(context, [
      ["error-a.json", {}],
      ["index-b.json", {}],
    ]);
    const result = await findCurrentReplyIndexPath(tmpPath);
    assert.strictEqual(result, path.join(tmpPath, "index-b.json"));
  });
});

describe("readIndex", () => {
  it("reads a well-formed index file with complete structure", async function (context) {
    const mockIndex = {
      cmake: {
        version: {
          major: 3,
          minor: 26,
          patch: 0,
          suffix: "",
          string: "3.26.0",
          isDirty: false,
        },
        paths: {
          cmake: "/usr/bin/cmake",
          ctest: "/usr/bin/ctest",
          cpack: "/usr/bin/cpack",
          root: "/usr/share/cmake",
        },
        generator: {
          multiConfig: false,
          name: "Unix Makefiles",
          // Note: platform is optional according to docs - omitted here like in the example
        },
      },
      objects: [
        {
          kind: "codemodel",
          version: { major: 2, minor: 0 },
          jsonFile: "codemodel-v2-12345.json",
        },
        {
          kind: "cache",
          version: { major: 2, minor: 0 },
          jsonFile: "cache-v2-67890.json",
        },
      ],
      reply: {
        "codemodel-v2": {
          kind: "codemodel",
          version: { major: 2, minor: 0 },
          jsonFile: "codemodel-v2-12345.json",
        },
        "cache-v2": {
          kind: "cache",
          version: { major: 2, minor: 0 },
          jsonFile: "cache-v2-67890.json",
        },
        "unknown-kind-v1": {
          error: "unknown query file",
        },
        "client-test-client": {
          "codemodel-v2": {
            kind: "codemodel",
            version: { major: 2, minor: 0 },
            jsonFile: "codemodel-v2-12345.json",
          },
          "unknown-v1": {
            error: "unknown query file",
          },
        },
      },
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["index-a.json", mockIndex],
    ]);
    const result = await readIndex(path.join(tmpPath, "index-a.json"));

    // Verify the entire structure matches our mock data
    assert.deepStrictEqual(result, mockIndex);
  });

  it("reads index file with generator platform", async function (context) {
    const mockIndexWithPlatform = {
      cmake: {
        version: {
          major: 3,
          minor: 26,
          patch: 0,
          suffix: "",
          string: "3.26.0",
          isDirty: false,
        },
        paths: {
          cmake: "/usr/bin/cmake",
          ctest: "/usr/bin/ctest",
          cpack: "/usr/bin/cpack",
          root: "/usr/share/cmake",
        },
        generator: {
          multiConfig: true,
          name: "Visual Studio 16 2019",
          platform: "x64", // Present when generator supports CMAKE_GENERATOR_PLATFORM
        },
      },
      objects: [],
      reply: {},
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["index-b.json", mockIndexWithPlatform],
    ]);
    const result = await readIndex(path.join(tmpPath, "index-b.json"));

    // Verify the entire structure matches our mock data
    assert.deepStrictEqual(result, mockIndexWithPlatform);
  });
});

describe("readCodeModel", () => {
  it("reads a well-formed codemodel file", async function (context) {
    const mockCodemodel = {
      kind: "codemodel",
      version: { major: 2, minor: 3 },
      paths: {
        source: "/path/to/source",
        build: "/path/to/build",
      },
      configurations: [
        {
          name: "Debug",
          directories: [
            {
              source: ".",
              build: ".",
              childIndexes: [],
              projectIndex: 0,
              targetIndexes: [0],
              hasInstallRule: true,
              minimumCMakeVersion: {
                string: "3.14",
              },
              jsonFile: "directory-debug.json",
            },
          ],
          projects: [
            {
              name: "MyProject",
              directoryIndexes: [0],
              targetIndexes: [0],
            },
          ],
          targets: [
            {
              name: "MyExecutable",
              id: "MyExecutable::@6890a9b7b1a1a2e4d6b9",
              directoryIndex: 0,
              projectIndex: 0,
              jsonFile: "target-MyExecutable.json",
            },
          ],
        },
      ],
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["codemodel-v2-12345.json", mockCodemodel],
    ]);
    const result = await readCodeModel(
      path.join(tmpPath, "codemodel-v2-12345.json"),
    );

    // Verify the entire structure matches our mock data
    assert.deepStrictEqual(result, mockCodemodel);
  });
});

describe("readTarget", () => {
  it("reads a well-formed target file", async function (context) {
    const mockTarget = {
      name: "MyExecutable",
      id: "MyExecutable::@6890a9b7b1a1a2e4d6b9",
      type: "EXECUTABLE",
      backtrace: 1,
      folder: {
        name: "Executables",
      },
      paths: {
        source: ".",
        build: ".",
      },
      nameOnDisk: "MyExecutable",
      artifacts: [
        {
          path: "MyExecutable",
        },
      ],
      isGeneratorProvided: false,
      install: {
        prefix: {
          path: "/usr/local",
        },
        destinations: [
          {
            path: "bin",
            backtrace: 2,
          },
        ],
      },
      launchers: [
        {
          command: "/usr/bin/gdb",
          arguments: ["--args"],
          type: "test",
        },
      ],
      link: {
        language: "CXX",
        commandFragments: [
          {
            fragment: "-O3",
            role: "flags",
            backtrace: 3,
          },
        ],
        lto: false,
        sysroot: {
          path: "/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk",
        },
      },
      dependencies: [
        {
          id: "MyLibrary::@6890a9b7b1a1a2e4d6b9",
          backtrace: 4,
        },
      ],
      fileSets: [
        {
          name: "HEADERS",
          type: "HEADERS",
          visibility: "PUBLIC",
          baseDirectories: ["."],
        },
      ],
      sources: [
        {
          path: "main.cpp",
          compileGroupIndex: 0,
          sourceGroupIndex: 0,
          isGenerated: false,
          fileSetIndex: 0,
          backtrace: 5,
        },
      ],
      sourceGroups: [
        {
          name: "Source Files",
          sourceIndexes: [0],
        },
      ],
      compileGroups: [
        {
          sourceIndexes: [0],
          language: "CXX",
          languageStandard: {
            backtraces: [6],
            standard: "17",
          },
          compileCommandFragments: [
            {
              fragment: "-std=c++17",
              backtrace: 7,
            },
          ],
          includes: [
            {
              path: "/usr/include",
              isSystem: true,
              backtrace: 8,
            },
          ],
          frameworks: [
            {
              path: "/System/Library/Frameworks/Foundation.framework",
              isSystem: true,
              backtrace: 9,
            },
          ],
          precompileHeaders: [
            {
              header: "pch.h",
              backtrace: 10,
            },
          ],
          defines: [
            {
              define: "NDEBUG",
              backtrace: 11,
            },
          ],
          sysroot: {
            path: "/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk",
          },
        },
      ],
      backtraceGraph: {
        nodes: [
          {
            file: 0,
            line: 1,
            command: 0,
            parent: null,
          },
        ],
        commands: ["add_executable"],
        files: ["CMakeLists.txt"],
      },
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["target-MyExecutable.json", mockTarget],
    ]);
    const result = await readTarget(
      path.join(tmpPath, "target-MyExecutable.json"),
    );

    // Verify the entire structure matches our mock data
    assert.deepStrictEqual(result, mockTarget);
  });

  // Base objects for reusable test data
  const baseTarget = {
    name: "MyTarget",
    id: "MyTarget::@6890a9b7b1a1a2e4d6b9",
    type: "EXECUTABLE" as const,
    paths: {
      source: ".",
      build: ".",
    },
  };

  const baseCompileGroup = {
    sourceIndexes: [0],
    language: "CXX",
    includes: [
      {
        path: "/usr/include",
        isSystem: true,
        backtrace: 1,
      },
    ],
    defines: [
      {
        define: "NDEBUG",
        backtrace: 2,
      },
    ],
  };

  const baseSource = {
    path: "main.cpp",
    compileGroupIndex: 0,
    isGenerated: false,
    backtrace: 1,
  };

  it("validates TargetV2_0 schema (base version)", async function (context) {
    const targetV2_0 = {
      ...baseTarget,
      sources: [baseSource],
      compileGroups: [baseCompileGroup],
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["target-v2_0.json", targetV2_0],
    ]);
    const result = await readTarget(
      path.join(tmpPath, "target-v2_0.json"),
      TargetV2_0,
    );

    assert.deepStrictEqual(result, targetV2_0);
  });

  it("validates TargetV2_1 schema (added precompileHeaders)", async function (context) {
    const targetV2_1 = {
      ...baseTarget,
      sources: [baseSource],
      compileGroups: [
        {
          ...baseCompileGroup,
          precompileHeaders: [
            {
              header: "pch.h",
              backtrace: 3,
            },
          ],
        },
      ],
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["target-v2_1.json", targetV2_1],
    ]);
    const result = await readTarget(
      path.join(tmpPath, "target-v2_1.json"),
      TargetV2_1,
    );

    assert.deepStrictEqual(result, targetV2_1);
  });

  it("validates TargetV2_2 schema (added languageStandard)", async function (context) {
    const targetV2_2 = {
      ...baseTarget,
      sources: [baseSource],
      compileGroups: [
        {
          ...baseCompileGroup,
          precompileHeaders: [
            {
              header: "pch.h",
              backtrace: 3,
            },
          ],
          languageStandard: {
            backtraces: [4],
            standard: "17",
          },
        },
      ],
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["target-v2_2.json", targetV2_2],
    ]);
    const result = await readTarget(
      path.join(tmpPath, "target-v2_2.json"),
      TargetV2_2,
    );

    assert.deepStrictEqual(result, targetV2_2);
  });

  it("validates TargetV2_5 schema (added fileSets and fileSetIndex)", async function (context) {
    const targetV2_5 = {
      ...baseTarget,
      fileSets: [
        {
          name: "HEADERS",
          type: "HEADERS",
          visibility: "PUBLIC" as const,
          baseDirectories: ["."],
        },
      ],
      sources: [
        {
          ...baseSource,
          fileSetIndex: 0,
        },
      ],
      compileGroups: [
        {
          ...baseCompileGroup,
          precompileHeaders: [
            {
              header: "pch.h",
              backtrace: 3,
            },
          ],
          languageStandard: {
            backtraces: [4],
            standard: "17",
          },
        },
      ],
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["target-v2_5.json", targetV2_5],
    ]);
    const result = await readTarget(
      path.join(tmpPath, "target-v2_5.json"),
      TargetV2_5,
    );

    assert.deepStrictEqual(result, targetV2_5);
  });

  it("validates TargetV2_6 schema (added frameworks)", async function (context) {
    const targetV2_6 = {
      ...baseTarget,
      fileSets: [
        {
          name: "HEADERS",
          type: "HEADERS",
          visibility: "PUBLIC" as const,
          baseDirectories: ["."],
        },
      ],
      sources: [
        {
          ...baseSource,
          fileSetIndex: 0,
        },
      ],
      compileGroups: [
        {
          ...baseCompileGroup,
          precompileHeaders: [
            {
              header: "pch.h",
              backtrace: 3,
            },
          ],
          languageStandard: {
            backtraces: [4],
            standard: "17",
          },
          frameworks: [
            {
              path: "/System/Library/Frameworks/Foundation.framework",
              isSystem: true,
              backtrace: 5,
            },
          ],
        },
      ],
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["target-v2_6.json", targetV2_6],
    ]);
    const result = await readTarget(
      path.join(tmpPath, "target-v2_6.json"),
      TargetV2_6,
    );

    assert.deepStrictEqual(result, targetV2_6);
  });

  it("validates TargetV2_7 schema (added launchers)", async function (context) {
    const targetV2_7 = {
      ...baseTarget,
      launchers: [
        {
          command: "/usr/bin/gdb",
          arguments: ["--args"],
          type: "test" as const,
        },
      ],
      fileSets: [
        {
          name: "HEADERS",
          type: "HEADERS",
          visibility: "PUBLIC" as const,
          baseDirectories: ["."],
        },
      ],
      sources: [
        {
          ...baseSource,
          fileSetIndex: 0,
        },
      ],
      compileGroups: [
        {
          ...baseCompileGroup,
          precompileHeaders: [
            {
              header: "pch.h",
              backtrace: 3,
            },
          ],
          languageStandard: {
            backtraces: [4],
            standard: "17",
          },
          frameworks: [
            {
              path: "/System/Library/Frameworks/Foundation.framework",
              isSystem: true,
              backtrace: 5,
            },
          ],
        },
      ],
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["target-v2_7.json", targetV2_7],
    ]);
    const result = await readTarget(
      path.join(tmpPath, "target-v2_7.json"),
      TargetV2_7,
    );

    assert.deepStrictEqual(result, targetV2_7);
  });

  it("validates TargetV2_8 schema (added debugger)", async function (context) {
    const targetV2_8 = {
      ...baseTarget,
      debugger: {
        workingDirectory: "/path/to/debug",
      },
      launchers: [
        {
          command: "/usr/bin/gdb",
          arguments: ["--args"],
          type: "test" as const,
        },
      ],
      fileSets: [
        {
          name: "HEADERS",
          type: "HEADERS",
          visibility: "PUBLIC" as const,
          baseDirectories: ["."],
        },
      ],
      sources: [
        {
          ...baseSource,
          fileSetIndex: 0,
        },
      ],
      compileGroups: [
        {
          ...baseCompileGroup,
          precompileHeaders: [
            {
              header: "pch.h",
              backtrace: 3,
            },
          ],
          languageStandard: {
            backtraces: [4],
            standard: "17",
          },
          frameworks: [
            {
              path: "/System/Library/Frameworks/Foundation.framework",
              isSystem: true,
              backtrace: 5,
            },
          ],
        },
      ],
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["target-v2_8.json", targetV2_8],
    ]);
    const result = await readTarget(
      path.join(tmpPath, "target-v2_8.json"),
      TargetV2_8,
    );

    assert.deepStrictEqual(result, targetV2_8);
  });
});

describe("readCache", () => {
  it("reads a well-formed cache file", async function (context) {
    const mockCache = {
      kind: "cache",
      version: { major: 2, minor: 0 },
      entries: [
        {
          name: "BUILD_SHARED_LIBS",
          value: "ON",
          type: "BOOL",
          properties: [
            {
              name: "HELPSTRING",
              value: "Build shared libraries",
            },
          ],
        },
        {
          name: "CMAKE_GENERATOR",
          value: "Unix Makefiles",
          type: "INTERNAL",
          properties: [
            {
              name: "HELPSTRING",
              value: "Name of generator.",
            },
          ],
        },
      ],
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["cache-v2.json", mockCache],
    ]);
    const result = await readCache(path.join(tmpPath, "cache-v2.json"));

    // Verify the entire structure matches our mock data
    assert.deepStrictEqual(result, mockCache);
  });
});

describe("readCmakeFiles", () => {
  it("reads a well-formed cmakeFiles file", async function (context) {
    const mockCmakeFiles = {
      kind: "cmakeFiles",
      version: { major: 1, minor: 1 },
      paths: {
        build: "/path/to/top-level-build-dir",
        source: "/path/to/top-level-source-dir",
      },
      inputs: [
        {
          path: "CMakeLists.txt",
        },
        {
          isGenerated: true,
          path: "/path/to/top-level-build-dir/.../CMakeSystem.cmake",
        },
        {
          isExternal: true,
          path: "/path/to/external/third-party/module.cmake",
        },
        {
          isCMake: true,
          isExternal: true,
          path: "/path/to/cmake/Modules/CMakeGenericSystem.cmake",
        },
      ],
      globsDependent: [
        {
          expression: "src/*.cxx",
          recurse: true,
          paths: ["src/foo.cxx", "src/bar.cxx"],
        },
      ],
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["cmakeFiles-v1.json", mockCmakeFiles],
    ]);
    const result = await readCmakeFiles(
      path.join(tmpPath, "cmakeFiles-v1.json"),
    );

    // Verify the entire structure matches our mock data
    assert.deepStrictEqual(result, mockCmakeFiles);
  });

  // Base objects for reusable test data
  const baseCmakeFiles = {
    kind: "cmakeFiles" as const,
    paths: {
      build: "/path/to/top-level-build-dir",
      source: "/path/to/top-level-source-dir",
    },
    inputs: [
      {
        path: "CMakeLists.txt",
      },
      {
        isExternal: true,
        path: "/path/to/external/third-party/module.cmake",
      },
    ],
  };

  it("validates CmakeFilesV1_0 schema (base version)", async function (context) {
    const cmakeFilesV1_0 = {
      ...baseCmakeFiles,
      version: { major: 1, minor: 0 },
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["cmakeFiles-v1_0.json", cmakeFilesV1_0],
    ]);
    const result = await readCmakeFiles(
      path.join(tmpPath, "cmakeFiles-v1_0.json"),
      CmakeFilesV1_0,
    );

    assert.deepStrictEqual(result, cmakeFilesV1_0);
  });

  it("validates CmakeFilesV1_1 schema (added globsDependent)", async function (context) {
    const cmakeFilesV1_1 = {
      ...baseCmakeFiles,
      version: { major: 1, minor: 1 },
      globsDependent: [
        {
          expression: "src/*.cxx",
          recurse: true,
          paths: ["src/foo.cxx", "src/bar.cxx"],
        },
      ],
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["cmakeFiles-v1_1.json", cmakeFilesV1_1],
    ]);
    const result = await readCmakeFiles(
      path.join(tmpPath, "cmakeFiles-v1_1.json"),
      CmakeFilesV1_1,
    );

    assert.deepStrictEqual(result, cmakeFilesV1_1);
  });
});

describe("readToolchains", () => {
  it("reads a well-formed toolchains file", async function (context) {
    const mockToolchains = {
      kind: "toolchains",
      version: { major: 1, minor: 0 },
      toolchains: [
        {
          language: "C",
          compiler: {
            path: "/usr/bin/cc",
            id: "GNU",
            version: "9.3.0",
            implicit: {
              includeDirectories: [
                "/usr/lib/gcc/x86_64-linux-gnu/9/include",
                "/usr/local/include",
                "/usr/include/x86_64-linux-gnu",
                "/usr/include",
              ],
              linkDirectories: [
                "/usr/lib/gcc/x86_64-linux-gnu/9",
                "/usr/lib/x86_64-linux-gnu",
                "/usr/lib",
                "/lib/x86_64-linux-gnu",
                "/lib",
              ],
              linkFrameworkDirectories: [],
              linkLibraries: ["gcc", "gcc_s", "c", "gcc", "gcc_s"],
            },
          },
          sourceFileExtensions: ["c", "m"],
        },
        {
          language: "CXX",
          compiler: {
            path: "/usr/bin/c++",
            id: "GNU",
            version: "9.3.0",
            implicit: {
              includeDirectories: [
                "/usr/include/c++/9",
                "/usr/include/x86_64-linux-gnu/c++/9",
                "/usr/include/c++/9/backward",
                "/usr/lib/gcc/x86_64-linux-gnu/9/include",
                "/usr/local/include",
                "/usr/include/x86_64-linux-gnu",
                "/usr/include",
              ],
              linkDirectories: [
                "/usr/lib/gcc/x86_64-linux-gnu/9",
                "/usr/lib/x86_64-linux-gnu",
                "/usr/lib",
                "/lib/x86_64-linux-gnu",
                "/lib",
              ],
              linkFrameworkDirectories: [],
              linkLibraries: [
                "stdc++",
                "m",
                "gcc_s",
                "gcc",
                "c",
                "gcc_s",
                "gcc",
              ],
            },
          },
          sourceFileExtensions: [
            "C",
            "M",
            "c++",
            "cc",
            "cpp",
            "cxx",
            "mm",
            "CPP",
          ],
        },
      ],
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["toolchains-v1.json", mockToolchains],
    ]);
    const result = await readToolchains(
      path.join(tmpPath, "toolchains-v1.json"),
    );

    // Verify the entire structure matches our mock data
    assert.deepStrictEqual(result, mockToolchains);
  });
});
