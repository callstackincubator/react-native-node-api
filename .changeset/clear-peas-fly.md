---
"cmake-rn": patch
---

Fix auto-linking failures due to lack of padding when renaming install name of libraries, by passing headerpad_max_install_names argument to linker.
