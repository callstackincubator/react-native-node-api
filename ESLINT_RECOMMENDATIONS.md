# ESLint Rules Recommendations

This document outlines exciting patterns found in the codebase and suggests ESLint rules to install/enable in separate PRs.

## Current State

The project currently uses:
- **ESLint 9.32.0** with flat config
- **typescript-eslint 8.38.0** with `recommendedTypeChecked`
- **eslint-config-prettier** for Prettier integration
- **Project references** for TypeScript with strict type checking
- **~700 existing lint errors** (mostly `@typescript-eslint/no-unsafe-*` rules)

## Exciting Patterns Found

### 1. 🎯 Consistent Error Handling
- **Pattern**: Custom `UsageError` class with `fix` property for actionable error messages
- **Location**: `packages/cli-utils/src/errors.ts`
- **Impact**: CLI tools provide helpful suggestions to users
- **Notable**: The `wrapAction` wrapper consistently handles errors across CLI commands

### 2. 🔒 Extensive Use of Node.js Assertions
- **Pattern**: Heavy use of `assert` from `node:assert/strict` for runtime invariants
- **Frequency**: Found in virtually all core files
- **Quality**: Assertions include descriptive messages
- **Example**: `assert(typeof pkg.name === "string", "Expected package.json to have a name")`

### 3. 📦 Modular Architecture
- **Pattern**: Clear separation of concerns across packages
- **Structure**: CLI utils, platform-specific code, core logic all separated
- **Testing**: Test files co-located with source (`*.test.ts`)

### 4. 🛠️ Console Logging in CLI Tools
- **Pattern**: Extensive `console.log`, `console.error` usage in CLI tools
- **Purpose**: User feedback and debugging
- **Scope**: Primarily in packages like `cmake-rn`, `ferric`, `gyp-to-cmake`, `host`

### 5. 🎨 Rich Terminal Output
- **Pattern**: Consistent use of `chalk` for colored output
- **Quality**: Good UX with colored success/error messages
- **Helper**: Custom `prettyPath` utility for displaying paths

### 6. 📝 TODO Comments
- **Frequency**: ~20+ TODO comments throughout codebase
- **Common themes**:
  - Future feature implementations
  - Optimization opportunities
  - Upstream contribution plans
  - Platform support expansions

### 7. ⚠️ Process Exit Handling
- **Pattern**: Minimal direct `process.exit()` calls
- **Best practice**: Uses `process.exitCode` instead for cleaner shutdown
- **Found in**: CLI entry points and error handlers

### 8. 🔄 Promise Patterns
- **Pattern**: Extensive use of `Promise.all()` for parallel operations
- **Use cases**: Building multiple targets, processing multiple platforms
- **Quality**: Good parallelization of independent operations

### 9. 🚫 Minimal eslint-disable Usage
- **Finding**: Only 2 instances of `eslint-disable` in the entire codebase
- **Quality indicator**: Shows commitment to fixing issues rather than suppressing

## Recommended ESLint Rules (by PR)

### PR #1: Code Quality & Best Practices (High Priority)

#### 1. `no-console` (with CLI exceptions)
**Why**: Enforce proper logging in library code while allowing console in CLI tools
```javascript
{
  "no-console": ["warn", {
    "allow": [] // Empty by default
  }],
  // Override for CLI files
  files: ["**/cli/*.ts", "**/bin/*.js", "**/bin/*.mjs"],
  rules: {
    "no-console": "off"
  }
}
```
**Impact**: Medium - Will require adding a proper logging utility for non-CLI code
**Exciting**: Distinguishes between library code and CLI tools

#### 2. `no-throw-literal`
**Why**: All errors should be proper Error objects (already followed)
```javascript
{
  "no-throw-literal": "error",
  "@typescript-eslint/no-throw-literal": "error"
}
```
**Impact**: Low - Already well-followed in codebase
**Exciting**: Ensures consistent error handling patterns

#### 3. `prefer-promise-reject-errors`
**Why**: Consistent with Error-only throwing pattern
```javascript
{
  "prefer-promise-reject-errors": "error"
}
```
**Impact**: Low
**Exciting**: Complements the error handling strategy

### PR #2: TypeScript Strictness (Medium Priority)

#### 4. `@typescript-eslint/explicit-function-return-type`
**Why**: Improves type safety and documentation
```javascript
{
  "@typescript-eslint/explicit-function-return-type": ["warn", {
    "allowExpressions": true,
    "allowTypedFunctionExpressions": true,
    "allowHigherOrderFunctions": true
  }]
}
```
**Impact**: High - Will require adding return types to ~100+ functions
**Exciting**: Catches potential type inference issues early
**Note**: Start with "warn" and upgrade to "error" over time

#### 5. `@typescript-eslint/consistent-type-imports`
**Why**: Consistent import style, better tree-shaking
```javascript
{
  "@typescript-eslint/consistent-type-imports": ["error", {
    "prefer": "type-imports",
    "fixMergeTypeImports": true,
    "fixMergeDefaultImportWithTypeImports": true
  }]
}
```
**Impact**: Medium - Will affect many import statements
**Exciting**: Aligns with modern TypeScript best practices

#### 6. `@typescript-eslint/consistent-type-exports`
**Why**: Complements consistent-type-imports
```javascript
{
  "@typescript-eslint/consistent-type-exports": ["error", {
    "fixMixedExportsWithInlineTypeSpecifier": true
  }]
}
```
**Impact**: Low-Medium
**Exciting**: Complete type import/export consistency

### PR #3: Code Organization (Medium Priority)

#### 7. `import/order` (requires eslint-plugin-import)
**Why**: Consistent import ordering improves readability
```javascript
{
  "import/order": ["error", {
    "groups": [
      "builtin",
      "external",
      "internal",
      "parent",
      "sibling",
      "index"
    ],
    "newlines-between": "always",
    "alphabetize": {
      "order": "asc",
      "caseInsensitive": true
    }
  }]
}
```
**Impact**: Medium - Will reorder many imports
**Exciting**: Pattern already partially followed (node: imports first)
**Package**: `eslint-plugin-import` (with TypeScript resolver)

#### 8. `import/no-default-export` (selective)
**Why**: Named exports are more refactor-friendly
```javascript
{
  // Only for non-config files
  "import/no-default-export": "warn"
}
// Allow in config files
{
  files: ["*.config.js", "*.config.ts"],
  rules: {
    "import/no-default-export": "off"
  }
}
```
**Impact**: Low - Project already uses named exports predominantly
**Exciting**: Enforces a pattern already mostly followed

### PR #4: Comment Quality (Low Priority)

#### 9. `no-warning-comments`
**Why**: Track TODOs/FIXMEs systematically
```javascript
{
  "no-warning-comments": ["warn", {
    "terms": ["todo", "fixme", "xxx"],
    "location": "start"
  }]
}
```
**Impact**: Low - ~20 existing TODOs need addressing or exemption
**Exciting**: Can integrate with issue tracking
**Alternative**: Use `eslint-plugin-etc` for more sophisticated TODO tracking

#### 10. `eslint-comments/no-unused-disable`
**Why**: Keep eslint-disable comments current
```javascript
{
  "eslint-comments/no-unused-disable": "error"
}
```
**Impact**: Very Low - Only 2 disable comments exist
**Package**: `eslint-plugin-eslint-comments`
**Exciting**: Prevents comment cruft accumulation

### PR #5: Security & Safety (High Priority)

#### 11. `no-eval` and `no-implied-eval`
**Why**: Prevent code injection vulnerabilities
```javascript
{
  "no-eval": "error",
  "no-implied-eval": "error",
  "@typescript-eslint/no-implied-eval": "error"
}
```
**Impact**: Very Low - Not currently used
**Exciting**: Security baseline

#### 12. `@typescript-eslint/no-non-null-assertion`
**Why**: Enforce explicit null checks
```javascript
{
  "@typescript-eslint/no-non-null-assertion": "warn"
}
```
**Impact**: Medium - Some non-null assertions may exist
**Exciting**: Increases runtime safety

### PR #6: Modern JavaScript (Low Priority)

#### 13. `prefer-template`
**Why**: Template literals over string concatenation
```javascript
{
  "prefer-template": "warn"
}
```
**Impact**: Low-Medium
**Exciting**: More readable string operations

#### 14. `prefer-const`
**Why**: Immutability by default
```javascript
{
  "prefer-const": ["error", {
    "destructuring": "all"
  }]
}
```
**Impact**: Low - Likely already followed
**Exciting**: Functional programming principles

#### 15. `no-var`
**Why**: Modern variable declarations
```javascript
{
  "no-var": "error"
}
```
**Impact**: Very Low - ESM project likely doesn't use var
**Exciting**: Baseline modern JS

### PR #7: Testing Standards (Medium Priority)

#### 16. `@typescript-eslint/no-floating-promises` (already enabled!)
**Status**: ✅ Already configured with test framework exceptions
**Configuration**: Allows `suite` and `test` from `node:test`
**Exciting**: Shows awareness of proper async handling

#### 17. Test-specific rules with `eslint-plugin-node-test`
**Why**: Enforce Node.js test best practices
```javascript
{
  files: ["**/*.test.ts"],
  rules: {
    // Test-specific rules here
  }
}
```
**Package**: Custom or community plugin for Node.js test runner
**Impact**: Low
**Exciting**: Standardizes test structure

### PR #8: Documentation (Low Priority)

#### 18. `jsdoc/require-jsdoc` (selective)
**Why**: Document public APIs
```javascript
{
  "jsdoc/require-jsdoc": ["warn", {
    "require": {
      "FunctionDeclaration": true,
      "MethodDefinition": false,
      "ClassDeclaration": true,
      "ArrowFunctionExpression": false
    },
    "publicOnly": true
  }]
}
```
**Package**: `eslint-plugin-jsdoc`
**Impact**: High - Many functions lack JSDoc
**Exciting**: TSDoc-compatible documentation
**Note**: Consider TypeScript's own documentation

### PR #9: Node.js Best Practices (Medium Priority)

#### 19. `eslint-plugin-n` (Node.js specific)
**Why**: Node.js specific best practices
```javascript
{
  "n/no-deprecated-api": "error",
  "n/no-missing-import": "off", // TypeScript handles this
  "n/no-unpublished-import": "off", // Handled by package.json
  "n/prefer-global/buffer": "error",
  "n/prefer-global/process": "error"
}
```
**Package**: `eslint-plugin-n`
**Impact**: Low
**Exciting**: Node.js ecosystem standards

### PR #10: Performance (Low Priority)

#### 20. `unicorn/prefer-module` and related
**Why**: Modern Node.js patterns
```javascript
{
  "unicorn/prefer-module": "off", // Some CommonJS needed
  "unicorn/prefer-node-protocol": "error", // Already followed!
  "unicorn/prefer-top-level-await": "warn"
}
```
**Package**: `eslint-plugin-unicorn`
**Impact**: Low - Already uses `node:` protocol
**Exciting**: Modern Node.js patterns
**Note**: `prefer-node-protocol` is already followed throughout!

## Priority Ranking Summary

### Must-Have (High Priority)
1. ⭐ **no-console** (with CLI exceptions) - Code quality
2. ⭐ **@typescript-eslint/consistent-type-imports** - Type safety
3. ⭐ Security rules (no-eval, etc.) - Security baseline

### Should-Have (Medium Priority)
4. **@typescript-eslint/explicit-function-return-type** - Documentation
5. **import/order** - Code organization
6. **eslint-plugin-n** - Node.js best practices
7. Test-specific rules - Testing standards

### Nice-to-Have (Low Priority)
8. Comment quality rules - Maintenance
9. Modern JS rules - Code style
10. Documentation rules - API documentation

## Implementation Strategy

### Phase 1: Quick Wins (Week 1)
- Security rules (already compliant)
- no-var, prefer-const (likely already compliant)
- unicorn/prefer-node-protocol (already followed!)

### Phase 2: Type Safety (Week 2-3)
- consistent-type-imports/exports
- explicit-function-return-type (start with warn)
- no-non-null-assertion

### Phase 3: Organization (Week 4)
- import/order
- import/no-default-export
- eslint-plugin-n

### Phase 4: Refinement (Ongoing)
- Address existing ~700 no-unsafe-* errors
- Add test-specific rules
- Documentation rules (gradual)

## New Package Dependencies

Recommended packages to install:
```json
{
  "devDependencies": {
    "eslint-plugin-import": "^2.30.0",
    "eslint-import-resolver-typescript": "^3.6.3",
    "eslint-plugin-eslint-comments": "^3.2.0",
    "eslint-plugin-n": "^17.16.0",
    "eslint-plugin-unicorn": "^56.0.1",
    "eslint-plugin-jsdoc": "^50.6.0"
  }
}
```

## Metrics

- **Current Files**: ~75 TypeScript files across packages
- **Total Lines**: ~13,440 lines of TypeScript
- **Test Coverage**: Good (12+ test files)
- **Current Lint Errors**: ~700 (mostly unsafe-* rules)
- **eslint-disable Usage**: Only 2 instances (excellent!)
- **TODO Comments**: ~20+ (tracked in code)

## Conclusion

This codebase already demonstrates many excellent patterns:
- ✅ Strict TypeScript configuration
- ✅ Consistent error handling with custom error classes
- ✅ Good use of assertions for runtime safety
- ✅ Modular architecture with clear separation
- ✅ Minimal eslint suppression
- ✅ Already using `node:` protocol imports
- ✅ Async handling awareness

The recommended ESLint rules will help:
1. **Codify existing patterns** (type imports, import order)
2. **Prevent regressions** (security rules, error handling)
3. **Improve maintainability** (documentation, comments)
4. **Enhance type safety** (explicit returns, no non-null)

Each PR should:
- Focus on a single category
- Include auto-fix where possible
- Show before/after examples
- Measure impact on existing code
- Consider gradual adoption (warn → error)
