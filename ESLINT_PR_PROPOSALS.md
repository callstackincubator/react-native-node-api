# ESLint Rules PR Proposals

This document provides actionable PR proposals for implementing the ESLint rules identified in `ESLINT_RECOMMENDATIONS.md`.

## Quick Reference Table

| PR # | Title | Priority | Packages | Impact | Auto-fix |
|------|-------|----------|----------|---------|----------|
| 1 | Console Logging Rules | High | None | Medium | Partial |
| 2 | TypeScript Type Imports | High | None | Medium | Yes |
| 3 | Security Baseline Rules | High | None | Low | No |
| 4 | Import Organization | Medium | `eslint-plugin-import` | Medium | Yes |
| 5 | Function Return Types | Medium | None | High | No |
| 6 | Node.js Best Practices | Medium | `eslint-plugin-n` | Low | Partial |
| 7 | Modern JavaScript | Low | `eslint-plugin-unicorn` | Low | Yes |
| 8 | Comment Quality | Low | `eslint-plugin-eslint-comments` | Low | Partial |
| 9 | Documentation | Low | `eslint-plugin-jsdoc` | High | No |
| 10 | Test Standards | Low | None | Low | No |

---

## PR #1: Console Logging Rules for CLI vs Library Code

### Title
`feat(eslint): enforce no-console in library code while allowing in CLI tools`

### Description
Adds `no-console` rule that distinguishes between library code (where console should be avoided) and CLI tools (where console is the primary user interface).

### Changes
```javascript
// In eslint.config.js
{
  rules: {
    "no-console": ["warn", { allow: [] }]
  }
},
{
  files: [
    "**/cli/*.ts",
    "**/cli/*.js",
    "**/bin/*.js",
    "**/bin/*.mjs",
    "scripts/**/*.ts",
    "scripts/**/*.mts"
  ],
  rules: {
    "no-console": "off"
  }
}
```

### Rationale
- Library code should use proper logging utilities
- CLI tools provide direct user feedback via console
- Distinguishes between different code contexts

### Files Affected
- ~25 files with console.log/error usage
- Primarily in: cmake-rn, ferric, gyp-to-cmake, host CLI tools

### Migration Path
1. Add rule as "warn" initially
2. Review library code console usage
3. Add logging utility if needed
4. Fix violations
5. Upgrade to "error"

### Testing
- Run: `npm run lint`
- Verify no false positives in CLI tools
- Verify warnings in library code

---

## PR #2: Consistent TypeScript Type Imports

### Title
`feat(eslint): enforce consistent type imports and exports`

### Description
Enables `@typescript-eslint/consistent-type-imports` and `@typescript-eslint/consistent-type-exports` to separate type and value imports for better tree-shaking and clarity.

### Changes
```javascript
// In eslint.config.js
{
  rules: {
    "@typescript-eslint/consistent-type-imports": ["error", {
      prefer: "type-imports",
      fixMergeTypeImports: true,
      fixMergeDefaultImportWithTypeImports: true
    }],
    "@typescript-eslint/consistent-type-exports": ["error", {
      fixMixedExportsWithInlineTypeSpecifier: true
    }]
  }
}
```

### Rationale
- Improves tree-shaking
- Makes code intention clearer
- Follows modern TypeScript best practices
- Aligns with bundler optimizations

### Files Affected
- ~70 TypeScript files with imports
- Mostly type imports will be converted

### Migration Path
1. Enable rules
2. Run: `npm run lint -- --fix`
3. Verify changes
4. Commit auto-fixed code

### Testing
- Run: `npm run lint`
- Run: `npm test`
- Verify builds: `npm run build`

### Example
```typescript
// Before
import { EventEmitter } from "node:events";
import { PlatformName, Platform } from "./types.js";

// After
import { EventEmitter } from "node:events";
import type { PlatformName, Platform } from "./types.js";
```

---

## PR #3: Security Baseline Rules

### Title
`feat(eslint): add security baseline rules (no-eval, no-implied-eval)`

### Description
Adds security-focused ESLint rules to prevent code injection vulnerabilities and enforce type safety.

### Changes
```javascript
// In eslint.config.js
{
  rules: {
    "no-eval": "error",
    "no-implied-eval": "error",
    "@typescript-eslint/no-implied-eval": "error",
    "no-throw-literal": "error",
    "@typescript-eslint/no-throw-literal": "error",
    "prefer-promise-reject-errors": "error"
  }
}
```

### Rationale
- Prevents code injection attacks
- Enforces proper Error objects
- Security best practice baseline
- Likely zero violations (already followed)

### Files Affected
- None expected (preventive measure)

### Migration Path
1. Enable rules
2. Run: `npm run lint`
3. Verify no violations
4. Commit config changes

### Testing
- Run: `npm run lint`
- Verify no new errors
- Run full test suite

---

## PR #4: Import Organization and Ordering

### Title
`feat(eslint): enforce consistent import ordering with eslint-plugin-import`

### Description
Adds `eslint-plugin-import` to enforce consistent import grouping and alphabetical ordering.

### Changes

**package.json:**
```json
{
  "devDependencies": {
    "eslint-plugin-import": "^2.30.0",
    "eslint-import-resolver-typescript": "^3.6.3"
  }
}
```

**eslint.config.js:**
```javascript
import importPlugin from "eslint-plugin-import";

export default tseslint.config(
  // ... existing config
  {
    plugins: {
      import: importPlugin
    },
    settings: {
      "import/resolver": {
        typescript: true,
        node: true
      }
    },
    rules: {
      "import/order": ["error", {
        groups: [
          "builtin",   // Node.js built-ins
          "external",  // npm packages
          "internal",  // Internal aliases
          "parent",    // ../
          "sibling",   // ./
          "index"      // ./index
        ],
        "newlines-between": "always",
        alphabetize: {
          order: "asc",
          caseInsensitive: true
        }
      }],
      "import/no-default-export": "warn",
      "import/newline-after-import": "error",
      "import/no-duplicates": "error"
    }
  },
  {
    // Allow default exports in configs
    files: ["*.config.js", "*.config.ts", "*.config.mjs"],
    rules: {
      "import/no-default-export": "off"
    }
  }
);
```

### Rationale
- Pattern already partially followed (node: imports first)
- Improves readability
- Makes conflicts easier to resolve
- Standardizes across the codebase

### Files Affected
- ~70 TypeScript files
- All files with imports

### Migration Path
1. Install dependencies
2. Add configuration
3. Run: `npm run lint -- --fix`
4. Review and commit changes

### Testing
- Run: `npm run lint`
- Run: `npm run build`
- Run: `npm test`

### Example
```typescript
// Before
import path from "node:path";
import { readPackageSync } from "read-pkg";
import assert from "node:assert/strict";
import { chalk } from "@react-native-node-api/cli-utils";

// After
import assert from "node:assert/strict";
import path from "node:path";

import { readPackageSync } from "read-pkg";

import { chalk } from "@react-native-node-api/cli-utils";
```

---

## PR #5: Explicit Function Return Types

### Title
`feat(eslint): require explicit return types for exported functions (warn)`

### Description
Adds `@typescript-eslint/explicit-function-return-type` to improve type safety and documentation. Initially set to "warn" for gradual adoption.

### Changes
```javascript
// In eslint.config.js
{
  rules: {
    "@typescript-eslint/explicit-function-return-type": ["warn", {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true,
      allowDirectConstAssertionInArrowFunctions: true,
      allowConciseArrowFunctionExpressionsStartingWithVoid: false
    }]
  }
}
```

### Rationale
- Catches type inference issues
- Improves API documentation
- Makes refactoring safer
- Explicit is better than implicit

### Files Affected
- ~100+ functions lacking return types
- Mostly exported/public functions

### Migration Path
1. Enable as "warn"
2. Address warnings gradually
3. Focus on public APIs first
4. Upgrade to "error" in follow-up PR

### Testing
- Run: `npm run lint`
- Verify type checking still passes
- Run: `npm test`

### Example
```typescript
// Before
export function getLibraryName(modulePath: string, naming: NamingStrategy) {
  // ...
  return parts.join("--");
}

// After
export function getLibraryName(
  modulePath: string,
  naming: NamingStrategy
): string {
  // ...
  return parts.join("--");
}
```

---

## PR #6: Node.js Best Practices

### Title
`feat(eslint): add Node.js best practices with eslint-plugin-n`

### Description
Adds `eslint-plugin-n` for Node.js-specific linting rules.

### Changes

**package.json:**
```json
{
  "devDependencies": {
    "eslint-plugin-n": "^17.16.0"
  }
}
```

**eslint.config.js:**
```javascript
import nodePlugin from "eslint-plugin-n";

export default tseslint.config(
  // ... existing config
  nodePlugin.configs["flat/recommended"],
  {
    rules: {
      // Override specific rules
      "n/no-missing-import": "off", // TypeScript handles this
      "n/no-unpublished-import": "off", // Handled by package.json
      "n/no-deprecated-api": "error",
      "n/prefer-global/buffer": "error",
      "n/prefer-global/process": "error",
      "n/prefer-node-protocol": "error", // Already followed!
      "n/no-process-exit": ["error", {
        // Allow in CLI entry points
        "files": ["**/bin/*.js", "**/bin/*.mjs"]
      }]
    }
  }
);
```

### Rationale
- Node.js ecosystem standards
- Deprecation warnings
- Module resolution best practices
- Already follows many patterns

### Files Affected
- Most TypeScript files (verification pass)
- Likely minimal changes needed

### Migration Path
1. Install package
2. Add configuration
3. Run: `npm run lint`
4. Fix any violations
5. Commit

### Testing
- Run: `npm run lint`
- Verify no false positives
- Run: `npm test`

---

## PR #7: Modern JavaScript Patterns

### Title
`feat(eslint): enable modern JavaScript patterns with Unicorn rules`

### Description
Adds select rules from `eslint-plugin-unicorn` for modern JavaScript patterns.

### Changes

**package.json:**
```json
{
  "devDependencies": {
    "eslint-plugin-unicorn": "^56.0.1"
  }
}
```

**eslint.config.js:**
```javascript
import unicornPlugin from "eslint-plugin-unicorn";

export default tseslint.config(
  // ... existing config
  {
    plugins: {
      unicorn: unicornPlugin
    },
    rules: {
      "unicorn/prefer-node-protocol": "error", // Already followed!
      "unicorn/prefer-module": "off", // Some CommonJS needed
      "unicorn/prefer-top-level-await": "warn",
      "prefer-template": "warn",
      "prefer-const": ["error", { destructuring: "all" }],
      "no-var": "error"
    }
  }
);
```

### Rationale
- Codifies existing patterns
- Modern Node.js best practices
- Likely mostly auto-fixable
- Performance improvements

### Files Affected
- All files (validation pass)
- Likely minimal violations

### Migration Path
1. Install package
2. Add configuration
3. Run: `npm run lint -- --fix`
4. Review and commit

### Testing
- Run: `npm run lint`
- Run: `npm test`
- Verify builds

---

## PR #8: Comment Quality Rules

### Title
`feat(eslint): track TODO comments and unused eslint-disable directives`

### Description
Adds rules to manage comment quality and track TODOs.

### Changes

**package.json:**
```json
{
  "devDependencies": {
    "eslint-plugin-eslint-comments": "^3.2.0"
  }
}
```

**eslint.config.js:**
```javascript
import eslintCommentsPlugin from "eslint-plugin-eslint-comments";

export default tseslint.config(
  // ... existing config
  eslintCommentsPlugin.configs.recommended,
  {
    rules: {
      "no-warning-comments": ["warn", {
        terms: ["todo", "fixme", "xxx", "hack"],
        location: "start"
      }],
      "eslint-comments/no-unused-disable": "error",
      "eslint-comments/no-unlimited-disable": "error"
    }
  }
);
```

### Rationale
- Track technical debt
- Keep disable comments clean
- Only 2 existing disables (excellent baseline)
- ~20 TODOs to track

### Files Affected
- Files with TODO comments (~15-20 files)
- Files with eslint-disable (2 files)

### Migration Path
1. Install package
2. Add configuration
3. Run: `npm run lint`
4. Review warnings
5. Optionally link TODOs to issues

### Testing
- Run: `npm run lint`
- Verify TODOs are flagged as warnings

---

## PR #9: API Documentation Standards

### Title
`feat(eslint): require JSDoc for public APIs (warn)`

### Description
Adds `eslint-plugin-jsdoc` to encourage documentation of public APIs.

### Changes

**package.json:**
```json
{
  "devDependencies": {
    "eslint-plugin-jsdoc": "^50.6.0"
  }
}
```

**eslint.config.js:**
```javascript
import jsdocPlugin from "eslint-plugin-jsdoc";

export default tseslint.config(
  // ... existing config
  jsdocPlugin.configs["flat/recommended-typescript"],
  {
    rules: {
      "jsdoc/require-jsdoc": ["warn", {
        require: {
          FunctionDeclaration: true,
          MethodDefinition: false,
          ClassDeclaration: true,
          ArrowFunctionExpression: false
        },
        publicOnly: true,
        exemptEmptyFunctions: true
      }],
      "jsdoc/require-param-description": "warn",
      "jsdoc/require-returns-description": "warn"
    }
  }
);
```

### Rationale
- Improves API documentation
- Helps generate docs
- TSDoc-compatible
- Start with warnings for gradual adoption

### Files Affected
- Exported functions (~100+ functions)
- Public classes (~10-15 classes)

### Migration Path
1. Install package
2. Add configuration as "warn"
3. Document high-priority APIs first
4. Gradually address warnings
5. Consider upgrade to "error" later

### Testing
- Run: `npm run lint`
- Verify documentation generation
- Run: `npm test`

---

## PR #10: Test Standards

### Title
`feat(eslint): enforce testing standards for Node.js test runner`

### Description
Adds test-specific ESLint rules for files using Node.js test runner.

### Changes
```javascript
// In eslint.config.js
{
  files: ["**/*.test.ts", "**/*.test.js"],
  rules: {
    "@typescript-eslint/no-unsafe-assignment": "off", // Tests often use dynamic data
    "@typescript-eslint/no-unsafe-call": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "max-lines-per-function": "off", // Tests can be long
    "max-nested-callbacks": ["warn", 5] // Test nesting
  }
}
```

### Rationale
- Tests have different constraints
- Allow more flexibility in test code
- Maintain core safety rules
- Balance strictness with pragmatism

### Files Affected
- ~12 test files

### Migration Path
1. Add configuration
2. Run: `npm run lint`
3. Run: `npm test`
4. Verify no issues

### Testing
- Run: `npm run lint`
- Run: `npm test`
- Verify test files aren't over-restricted

---

## Implementation Timeline

### Week 1: High Priority
- [ ] PR #1: Console Logging Rules
- [ ] PR #2: TypeScript Type Imports
- [ ] PR #3: Security Baseline Rules

### Week 2-3: Medium Priority
- [ ] PR #4: Import Organization
- [ ] PR #5: Function Return Types (warn)
- [ ] PR #6: Node.js Best Practices

### Week 4+: Low Priority
- [ ] PR #7: Modern JavaScript
- [ ] PR #8: Comment Quality
- [ ] PR #9: Documentation (warn)
- [ ] PR #10: Test Standards

### Ongoing
- Address existing ~700 `no-unsafe-*` errors
- Upgrade "warn" rules to "error"
- Monitor and refine rules

---

## Success Metrics

Track these metrics after each PR:

1. **Lint Error Count**: Target to reduce from ~700 to <100
2. **Auto-fix Success Rate**: % of errors fixed automatically
3. **False Positive Rate**: Should be <5%
4. **Build Time Impact**: Should be <10% increase
5. **Developer Feedback**: Collect via PR reviews

---

## Notes

- Each PR is independent and can be merged separately
- Auto-fixable rules should be prioritized
- Start with "warn" for high-impact rules
- Consider creating a "eslint-rules" label for these PRs
- Link each PR back to this document and ESLINT_RECOMMENDATIONS.md
