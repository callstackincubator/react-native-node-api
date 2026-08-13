---
"gyp-to-cmake": minor
---

Add --namespaced-targets to allow a root project to add many sub-projects.

CMake requires target names to be unique across a project tree, so sub-projects
that each declare an `addon` target cannot be added to a single root project. This
prefixes the target name with the project name, while setting `OUTPUT_NAME` so the
artifact keeps the name a `require` resolves against.
