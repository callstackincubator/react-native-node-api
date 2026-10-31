---
"gyp-to-cmake": minor
---

Resolve `cflags` and `ldflags` like gyp's make generator: emit them only when not targeting Apple or Windows, pass each target's flags as a single `SHELL:` option (so CMake no longer de-duplicates repeated flags like `-include a.h -include b.h`), word-split and unquote them as the shell would, and unescape `$$`. Also expand `<!(cmd)`, `<!@(cmd)` and `<(module_root_dir)` inside values.
