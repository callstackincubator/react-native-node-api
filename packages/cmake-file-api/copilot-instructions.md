# Copilot Instructions for cmake-file-api Package

This package provides a TypeScript wrapper around the CMake File API using Zod schemas for validation.

## Code Style Preferences

### Node.js Built-ins

- **Always** use Node.js built-ins with the `node:` prefix (e.g., `node:fs`, `node:path`, `node:assert/strict`)
- Prefer async APIs where possible (e.g., `fs.promises.readFile`, `fs.promises.writeFile`)

### Schema Validation

- Use **Zod** for all schema validation with strict typing
- Follow the CMake File API v1 specification precisely - read the documentation in `docs/cmake-file-api.7.rst.txt`
- Use `z.enum()` instead of generic strings for known enumeration values
- Make record values optional when they might not exist (e.g., `z.record(key, value.optional())`)
- **Keep schema files clean** - avoid inline comments except when strictly necessary for clarity
- **Use `index = z.number().int().min(0)`** for all *Index and *Indexes fields (they are documented as "unsigned integer 0-based index" in the CMake File API)

### TypeScript Patterns

- **No TypeScript type assertions (`as`)** unless explicitly justified
- Use destructuring to extract values from objects instead of accessing object properties repeatedly
- Prefer explicit assertions with meaningful messages over implicit type assumptions

### Testing

- Use Node.js built-in test runner and run test using the "Test cmake-file-api" task in VS Code
- **Prefer `assert.deepStrictEqual(result, mockData)`** over individual field assertions for schema validation
- Create comprehensive test cases that validate the complete schema structure
- Use proper type guards with assertions when dealing with optional values
- Test both positive cases (valid data) and ensure schemas properly validate structure

### Error Handling

- Use `assert` from `node:assert/strict` for runtime validation
- Provide descriptive error messages that help with debugging
- Handle CMake File API error objects properly (they have an `error` field instead of the expected structure)

## Architecture Patterns

### Schema Organization

- Export schemas with versioned names (e.g., `ReplyFileReferenceV1`, `IndexReplyV1`)
- Organize related schemas in dedicated files under `src/schemas/`
- Keep the main API functions in `src/reply.ts` and `src/query.ts`

### Minor Version Schema Pattern

When implementing schemas that support multiple minor versions (as documented in CMake File API), use this hierarchical extension pattern:

1. **Base Version Schema**: Create the earliest version as the base (e.g., `DirectoryV2_0`)
2. **Extended Version Schemas**: Use `.extend()` to add new fields for later versions (e.g., `DirectoryV2_3 = DirectoryV2_0.extend({...})`)
3. **Hierarchical Composition**: Parent schemas should also follow this pattern (e.g., `ConfigurationV2_3 = ConfigurationV2_0.extend({...})`)
4. **Version Constraints**: Use `minor: z.number().max(X)` for earlier versions and `minor: z.number().min(X)` for later versions
5. **Union Export**: Combine all versions using `z.union([SchemaV2_0, SchemaV2_3])` and export as the main schema name

This pattern ensures:

- Type safety across different minor versions
- Proper validation based on version numbers
- Clear inheritance hierarchy
- Backward compatibility support

### Context-Dependent Object Versioning

For objects that don't contain version information themselves (like Target objects), use the versioned extension pattern and export a union of all versions. Keep it DRY by versioning nested schemas separately:

```typescript
// Version nested schemas separately to avoid duplication
const SourceV2_0 = z.object({
  path: z.string(),
  // ... base fields
});

const SourceV2_5 = SourceV2_0.extend({
  fileSetIndex: index.optional(), // Added in v2.5
});

const CompileGroupV2_0 = z.object({
  sourceIndexes: z.array(index),
  language: z.string(),
  // ... base fields
});

const CompileGroupV2_1 = CompileGroupV2_0.extend({
  precompileHeaders: z.array(PrecompileHeader).optional(), // Added in v2.1
});

// Build main object versions using versioned nested schemas
const TargetV2_0 = z.object({
  // ... base fields
  sources: z.array(SourceV2_0).optional(),
  compileGroups: z.array(CompileGroupV2_0).optional(),
});

const TargetV2_1 = TargetV2_0.extend({
  compileGroups: z.array(CompileGroupV2_1).optional(), // Use versioned nested schema
});

const TargetV2_5 = TargetV2_2.extend({
  fileSets: z.array(FileSet).optional(),
  sources: z.array(SourceV2_5).optional(), // Use versioned nested schema
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
```

Then, reader functions should accept an optional schema parameter defaulting to the latest version:

```typescript
export async function readTarget(
  filePath: string,
  schema: z.ZodSchema = TargetV2_8, // Default to latest version
) {
  // ... implementation
}
```

This approach provides flexibility while maintaining type safety, avoiding code duplication, and allowing callers to specify the exact version schema when needed.

### Function Design

- Functions should be async where file I/O is involved
- Use clear, descriptive function names that indicate their purpose
- Validate file paths and extensions before processing
- Parse and validate JSON using Zod schemas rather than manual type checking

### Documentation References

- Always refer to the official CMake File API documentation
- The specification is available in `docs/cmake-file-api.7.rst.txt`
- When implementing Object Kinds, check the docs for exact field requirements and optional properties. Pay attention to indention in the document as it indicates nested structures.

## Example Patterns

### Good Schema Pattern

```typescript
const index = z.number().int().min(0);

export const MySchemaV1 = z.object({
  kind: z.enum(["validValue1", "validValue2"]),
  optionalField: z.string().optional(),
  parentIndex: index.optional(), // For *Index fields
  childIndexes: z.array(index).optional(), // For *Indexes fields
  requiredNested: z.object({
    major: z.number(),
    minor: z.number(),
  }),
});
```

### Good Minor Version Schema Pattern

```typescript
// Base version schema (earliest version)
const ItemV2_0 = z.object({
  name: z.string(),
  type: z.enum(["TYPE1", "TYPE2"]),
  paths: z.object({
    source: z.string(),
    build: z.string(),
  }),
});

// Extended version schema (adds fields introduced in v2.3)
const ItemV2_3 = ItemV2_0.extend({
  jsonFile: z.string(),
  metadata: z
    .object({
      version: z.string(),
    })
    .optional(),
});

// Parent schema versions
const ContainerV2_0 = z.object({
  kind: z.literal("container"),
  version: z.object({
    major: z.literal(2),
    minor: z.number().max(2), // Versions 2.0-2.2
  }),
  items: z.array(ItemV2_0),
});

const ContainerV2_3 = ContainerV2_0.extend({
  version: z.object({
    major: z.literal(2),
    minor: z.number().min(3), // Versions 2.3+
  }),
  items: z.array(ItemV2_3),
});

// Union export for all versions
export const ContainerV2 = z.union([ContainerV2_0, ContainerV2_3]);
```

### Good Function Pattern

```typescript
export async function readSomething(filePath: string) {
  assert(
    path.basename(filePath).startsWith("expected-") &&
      path.extname(filePath) === ".json",
    "Expected a path to an expected-*.json file",
  );
  const content = await fs.promises.readFile(filePath, "utf-8");
  const { field1, field2 } = MySchemaV1.parse(JSON.parse(content));
  // Use destructured values directly
  return { field1, field2 };
}
```

### Good Test Pattern

```typescript
it("validates complete structure", async function (context) {
  const mockData = {
    // Complete, realistic test data based on CMake File API docs
    field1: "expectedValue",
    field2: { nested: "structure" },
    optionalField: "presentValue",
  };

  const tmpPath = createMockReplyDirectory(context, [
    ["example-file.json", mockData],
  ]);
  const result = await readSomething(path.join(tmpPath, "example-file.json"));

  // Prefer deepStrictEqual for complete schema validation
  assert.deepStrictEqual(result, mockData);

  // Only use individual assertions when testing specific edge cases
  // const optionalValue = result.optionalField;
  // assert(optionalValue, "Expected optional field to exist in this test case");
});
```
