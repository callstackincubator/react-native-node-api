# ESLint Rules Implementation Quick Start

This guide helps you quickly implement the ESLint rule recommendations. Choose your approach:

## 🚀 Quick Implementation (Recommended Start)

### Option 1: Start with Zero-Impact Rules (Day 1)

These rules likely have zero or minimal violations and can be enabled immediately:

```bash
# 1. No code changes needed - just add to eslint.config.js
```

Add to your `eslint.config.js`:

```javascript
{
  rules: {
    // Security (likely zero violations)
    "no-eval": "error",
    "no-implied-eval": "error",
    "@typescript-eslint/no-implied-eval": "error",
    "no-throw-literal": "error",
    "@typescript-eslint/no-throw-literal": "error",
    "prefer-promise-reject-errors": "error",
    
    // Modern JS (likely zero violations)
    "no-var": "error",
    "prefer-const": ["error", { destructuring: "all" }],
  }
}
```

```bash
# 2. Verify no new errors
npm run lint

# 3. Commit if clean
git add eslint.config.js
git commit -m "feat(eslint): add security and modern JS baseline rules"
```

---

### Option 2: Auto-Fix Rules (Week 1)

These rules can automatically fix most violations:

```bash
# 1. Install dependencies
npm install -D eslint-plugin-unicorn@^56.0.1

# 2. Add to eslint.config.js
```

```javascript
import unicornPlugin from "eslint-plugin-unicorn";

export default tseslint.config(
  // ... existing config
  {
    plugins: {
      unicorn: unicornPlugin
    },
    rules: {
      "unicorn/prefer-node-protocol": "error",
      "prefer-template": "warn",
    }
  }
);
```

```bash
# 3. Auto-fix
npm run lint -- --fix

# 4. Review changes
git diff

# 5. Commit
git add -A
git commit -m "feat(eslint): enable auto-fixable rules (node protocol, templates)"
```

---

### Option 3: Type Import Consistency (Week 1)

Big impact, automatic fix:

```javascript
// Add to eslint.config.js
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

```bash
# Auto-fix all type imports
npm run lint -- --fix

# Verify builds still work
npm run build

# Test
npm test

# Commit
git add -A
git commit -m "feat(eslint): enforce consistent type imports/exports"
```

---

## 📋 Full Implementation Checklist

### Phase 1: Immediate (No Breaking Changes)
- [ ] Add security baseline rules (no-eval, etc.)
- [ ] Add modern JS rules (no-var, prefer-const)
- [ ] Enable `unicorn/prefer-node-protocol` (already followed)

### Phase 2: Auto-fixable (Week 1)
- [ ] Install eslint-plugin-unicorn
- [ ] Enable consistent-type-imports
- [ ] Enable prefer-template
- [ ] Run auto-fix and commit

### Phase 3: Import Organization (Week 2)
- [ ] Install eslint-plugin-import
- [ ] Configure import/order
- [ ] Run auto-fix
- [ ] Review and commit

### Phase 4: Gradual Adoption (Week 3-4)
- [ ] Add no-console with CLI exceptions (warn)
- [ ] Add explicit-function-return-type (warn)
- [ ] Address violations gradually
- [ ] Upgrade to "error" when ready

### Phase 5: Additional Tooling (Ongoing)
- [ ] Install eslint-plugin-n for Node.js rules
- [ ] Install eslint-plugin-jsdoc for docs (warn)
- [ ] Install eslint-plugin-eslint-comments
- [ ] Add test-specific rules

---

## 🎯 Priority Matrix

| Rule | Impact | Effort | Auto-fix | Priority |
|------|--------|--------|----------|----------|
| consistent-type-imports | High | Low | Yes | ⭐⭐⭐ |
| Security rules | High | None | No | ⭐⭐⭐ |
| import/order | Medium | Low | Yes | ⭐⭐ |
| no-console (CLI) | Medium | Medium | No | ⭐⭐ |
| prefer-node-protocol | Low | None | Yes | ⭐⭐ |
| explicit-function-return-type | High | High | No | ⭐ |
| JSDoc requirements | High | High | No | ⭐ |

---

## 🔧 Common Commands

```bash
# Check for errors without fixing
npm run lint

# Fix all auto-fixable issues
npm run lint -- --fix

# Check specific file
npm run lint -- path/to/file.ts

# See what would be fixed without changing
npm run lint -- --fix-dry-run

# Run with debug output
npm run lint -- --debug

# Cache results for faster runs
npm run lint -- --cache

# Disable cache
npm run lint -- --no-cache
```

---

## 📦 Package Installation Commands

For each PR, use these install commands:

```bash
# PR #2: Type imports (no packages needed)
# Built into typescript-eslint

# PR #4: Import organization
npm install -D eslint-plugin-import@^2.30.0 eslint-import-resolver-typescript@^3.6.3

# PR #6: Node.js best practices
npm install -D eslint-plugin-n@^17.16.0

# PR #7: Modern JavaScript
npm install -D eslint-plugin-unicorn@^56.0.1

# PR #8: Comment quality
npm install -D eslint-plugin-eslint-comments@^3.2.0

# PR #9: Documentation
npm install -D eslint-plugin-jsdoc@^50.6.0

# All at once (if preferred)
npm install -D \
  eslint-plugin-import@^2.30.0 \
  eslint-import-resolver-typescript@^3.6.3 \
  eslint-plugin-n@^17.16.0 \
  eslint-plugin-unicorn@^56.0.1 \
  eslint-plugin-eslint-comments@^3.2.0 \
  eslint-plugin-jsdoc@^50.6.0
```

---

## 🧪 Testing Strategy

After each rule addition:

```bash
# 1. Run linter
npm run lint

# 2. Build the project
npm run build

# 3. Run tests
npm test

# 4. Check specific packages
npm test --workspace react-native-node-api
npm test --workspace cmake-rn
npm test --workspace gyp-to-cmake

# 5. Verify no runtime issues
cd apps/test-app
npm run ios # or android
```

---

## 🎨 Configuration Templates

### Template 1: Minimal Start (Copy-Paste Ready)

```javascript
// Add to eslint.config.js after existing rules
{
  rules: {
    // Security
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-throw-literal": "error",
    "prefer-promise-reject-errors": "error",
    
    // Modern JS
    "no-var": "error",
    "prefer-const": ["error", { destructuring: "all" }],
    "prefer-template": "warn",
    
    // TypeScript
    "@typescript-eslint/consistent-type-imports": ["error", {
      prefer: "type-imports",
      fixMergeTypeImports: true
    }],
    "@typescript-eslint/consistent-type-exports": "error",
    "@typescript-eslint/no-throw-literal": "error",
    "@typescript-eslint/no-implied-eval": "error",
  }
}
```

### Template 2: With Plugins

```javascript
import unicornPlugin from "eslint-plugin-unicorn";

export default tseslint.config(
  // ... existing config ...
  {
    plugins: {
      unicorn: unicornPlugin
    },
    rules: {
      // All from Template 1, plus:
      "unicorn/prefer-node-protocol": "error",
    }
  }
);
```

### Template 3: Complete Configuration

See `ESLINT_PR_PROPOSALS.md` for full per-PR configurations.

---

## 🐛 Troubleshooting

### "Module not found" errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### ESLint cache issues

```bash
# Clear ESLint cache
npm run lint -- --no-cache
rm -rf .eslintcache
```

### Flat config not recognized

```bash
# Ensure eslint.config.js (not .eslintrc.*)
# Ensure ESLint 9.x is installed
npm list eslint
```

### TypeScript errors after rule changes

```bash
# Rebuild TypeScript
npm run build
# Or clean build
npm run clean && npm run build
```

### Import plugin not resolving TypeScript

```javascript
// Add to settings in eslint.config.js
settings: {
  "import/resolver": {
    typescript: {
      alwaysTryTypes: true,
      project: "./tsconfig.json"
    },
    node: true
  }
}
```

---

## 📊 Measuring Success

Track these metrics:

```bash
# Before changes
npm run lint 2>&1 | grep -E "error|warning" | tail -1

# After changes
npm run lint 2>&1 | grep -E "error|warning" | tail -1

# Get counts
npm run lint --format json > lint-before.json
# ... make changes ...
npm run lint --format json > lint-after.json

# Compare
# Use a JSON diff tool or:
node -e "
  const before = require('./lint-before.json');
  const after = require('./lint-after.json');
  console.log('Before:', before.map(f => f.errorCount).reduce((a,b) => a+b, 0), 'errors');
  console.log('After:', after.map(f => f.errorCount).reduce((a,b) => a+b, 0), 'errors');
"
```

---

## 🎓 Learning Resources

- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [typescript-eslint](https://typescript-eslint.io/)
- [eslint-plugin-import](https://github.com/import-js/eslint-plugin-import)
- [eslint-plugin-unicorn](https://github.com/sindresorhus/eslint-plugin-unicorn)
- [eslint-plugin-n](https://github.com/eslint-community/eslint-plugin-n)

---

## 🚦 When to Stop

You've done enough when:

1. ✅ Zero security rule violations
2. ✅ Consistent import style across codebase
3. ✅ <100 total lint errors (from current ~700)
4. ✅ All auto-fixable rules enabled and applied
5. ✅ CLI vs library code distinction enforced
6. ✅ Test suite passes
7. ✅ Build succeeds

Don't aim for perfection immediately. Gradual improvement is fine!

---

## 💡 Pro Tips

1. **Start small**: One PR at a time
2. **Auto-fix first**: Prioritize rules with auto-fix
3. **Use "warn" for learning**: New rules start as warnings
4. **Batch similar changes**: Group related rules in one PR
5. **Test thoroughly**: Each change should pass tests
6. **Document decisions**: Update this file with learnings
7. **Get team buy-in**: Discuss impact before merging

---

## 🎉 Quick Wins (Copy-Paste Commands)

```bash
# Complete quick-win setup in 5 minutes:

# 1. Add baseline rules (no violations expected)
echo "Adding security and modern JS rules..."
# Copy Template 1 to eslint.config.js

# 2. Verify
npm run lint

# 3. Add type imports (auto-fixable)
echo "Fixing type imports..."
# Add consistent-type-imports rule
npm run lint -- --fix

# 4. Commit
git add -A
git commit -m "feat(eslint): add baseline security rules and fix type imports"

# 5. Success!
echo "✅ Quick wins complete!"
```

Total time: ~5 minutes
Impact: 20-30% of recommended rules enabled
Breaking changes: None
