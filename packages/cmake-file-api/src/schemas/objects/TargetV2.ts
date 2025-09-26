import * as z from "zod";

const index = z.number().int().nonnegative();

const Artifact = z.object({
  path: z.string(),
});

const Folder = z.object({
  name: z.string(),
});

const InstallPrefix = z.object({
  path: z.string(),
});

const InstallDestination = z.object({
  path: z.string(),
  backtrace: index.optional(),
});

const Install = z.object({
  prefix: InstallPrefix,
  destinations: z.array(InstallDestination),
});

const Launcher = z.object({
  command: z.string(),
  arguments: z.array(z.string()).optional(),
  type: z.enum(["emulator", "test"]),
});

const LinkCommandFragment = z.object({
  fragment: z.string(),
  role: z.enum(["flags", "libraries", "libraryPath", "frameworkPath"]),
  backtrace: index.optional(),
});

const Sysroot = z.object({
  path: z.string(),
});

const Link = z.object({
  language: z.string(),
  commandFragments: z.array(LinkCommandFragment).optional(),
  lto: z.boolean().optional(),
  sysroot: Sysroot.optional(),
});

const ArchiveCommandFragment = z.object({
  fragment: z.string(),
  role: z.enum(["flags"]),
});

const Archive = z.object({
  commandFragments: z.array(ArchiveCommandFragment).optional(),
  lto: z.boolean().optional(),
});

const Debugger = z.object({
  workingDirectory: z.string().optional(),
});

const Dependency = z.object({
  id: z.string(),
  backtrace: index.optional(),
});

const FileSet = z.object({
  name: z.string(),
  type: z.string(),
  visibility: z.enum(["PUBLIC", "PRIVATE", "INTERFACE"]),
  baseDirectories: z.array(z.string()),
});

const SourceGroup = z.object({
  name: z.string(),
  sourceIndexes: z.array(index),
});

const LanguageStandard = z.object({
  backtraces: z.array(index).optional(),
  standard: z.string(),
});

const CompileCommandFragment = z.object({
  fragment: z.string(),
  backtrace: index.optional(),
});

const Include = z.object({
  path: z.string(),
  isSystem: z.boolean().optional(),
  backtrace: index.optional(),
});

const Framework = z.object({
  path: z.string(),
  isSystem: z.boolean().optional(),
  backtrace: index.optional(),
});

const PrecompileHeader = z.object({
  header: z.string(),
  backtrace: index.optional(),
});

const Define = z.object({
  define: z.string(),
  backtrace: index.optional(),
});

const BacktraceNode = z.object({
  file: index,
  line: z.number().int().positive().optional(),
  command: index.optional(),
  parent: index.nullable(),
});

const BacktraceGraph = z.object({
  nodes: z.array(BacktraceNode),
  commands: z.array(z.string()),
  files: z.array(z.string()),
});

// Versioned nested schemas
const SourceV2_0 = z.object({
  path: z.string(),
  compileGroupIndex: index.optional(),
  sourceGroupIndex: index.optional(),
  isGenerated: z.boolean().optional(),
  backtrace: index.optional(),
});

const SourceV2_5 = SourceV2_0.extend({
  fileSetIndex: index.optional(),
});

const CompileGroupV2_0 = z.object({
  sourceIndexes: z.array(index),
  language: z.string(),
  compileCommandFragments: z.array(CompileCommandFragment).optional(),
  includes: z.array(Include).optional(),
  defines: z.array(Define).optional(),
  sysroot: Sysroot.optional(),
});

const CompileGroupV2_1 = CompileGroupV2_0.extend({
  precompileHeaders: z.array(PrecompileHeader).optional(),
});

const CompileGroupV2_2 = CompileGroupV2_1.extend({
  languageStandard: LanguageStandard.optional(),
});

const CompileGroupV2_6 = CompileGroupV2_2.extend({
  frameworks: z.array(Framework).optional(),
});

// Base version (v2.0) - Original target fields
const TargetV2_0 = z.object({
  name: z.string(),
  id: z.string(),
  type: z.enum([
    "EXECUTABLE",
    "STATIC_LIBRARY",
    "SHARED_LIBRARY",
    "MODULE_LIBRARY",
    "OBJECT_LIBRARY",
    "INTERFACE_LIBRARY",
    "UTILITY",
  ]),
  backtrace: index.optional(),
  folder: Folder.optional(),
  paths: z.object({
    source: z.string(),
    build: z.string(),
  }),
  nameOnDisk: z.string().optional(),
  artifacts: z.array(Artifact).optional(),
  isGeneratorProvided: z.boolean().optional(),
  install: Install.optional(),
  link: Link.optional(),
  archive: Archive.optional(),
  dependencies: z.array(Dependency).optional(),
  sources: z.array(SourceV2_0).optional(),
  sourceGroups: z.array(SourceGroup).optional(),
  compileGroups: z.array(CompileGroupV2_0).optional(),
  backtraceGraph: BacktraceGraph.optional(),
});

// v2.1+ - Added precompileHeaders
const TargetV2_1 = TargetV2_0.extend({
  compileGroups: z.array(CompileGroupV2_1).optional(),
});

// v2.2+ - Added languageStandard
const TargetV2_2 = TargetV2_1.extend({
  compileGroups: z.array(CompileGroupV2_2).optional(),
});

// v2.5+ - Added fileSets and fileSetIndex in sources
const TargetV2_5 = TargetV2_2.extend({
  fileSets: z.array(FileSet).optional(),
  sources: z.array(SourceV2_5).optional(),
});

// v2.6+ - Added frameworks
const TargetV2_6 = TargetV2_5.extend({
  compileGroups: z.array(CompileGroupV2_6).optional(),
});

// v2.7+ - Added launchers
const TargetV2_7 = TargetV2_6.extend({
  launchers: z.array(Launcher).optional(),
});

// v2.8+ - Added debugger
const TargetV2_8 = TargetV2_7.extend({
  debugger: Debugger.optional(),
});

// Export union of all versions for flexible validation
export const TargetV2 = z.union([
  TargetV2_0,
  TargetV2_1,
  TargetV2_2,
  TargetV2_5,
  TargetV2_6,
  TargetV2_7,
  TargetV2_8,
]);

// Also export individual versions for specific use cases
export {
  TargetV2_0,
  TargetV2_1,
  TargetV2_2,
  TargetV2_5,
  TargetV2_6,
  TargetV2_7,
  TargetV2_8,
};
