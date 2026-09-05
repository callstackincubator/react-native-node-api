# CLAUDE.md (`.claude/`)

Guidance specific to Claude Code sessions that open pull requests against this
repository (including automated/scheduled sessions). See the root `CLAUDE.md`
and `AGENTS.md` for everything else.

## Keep inline comments very brief — put the color in the PR description

Default to **no comment at all**. Write one only when it carries knowledge a
reader cannot get from the code itself plus a `git blame` pointing at the PR
that introduced it. When you do write one, keep it to a line or two.

Rationale, rejected alternatives, benchmark numbers, "we tried X and it
didn't work", links to upstream issues, and anything that reads as a history
lesson belong in the **PR description** (and, where user-facing, the
changeset) — not in the source. Those places are where a reader who has
already found the line via `git blame` will end up anyway, and they don't
have to be maintained as the code around them changes.

Concretely, do not write comments that:

- restate what the next line already says;
- explain why an alternative implementation was _not_ chosen;
- narrate the change (`// now compiled out in release builds`) — that is a
  commit message, and it goes stale the moment the code moves;
- document a well-known toolchain fact (e.g. what `NDEBUG` means) that a
  reader can look up.

Comments that _do_ earn their place: a non-obvious constraint the compiler or
platform imposes, a workaround with the exact condition that makes it
removable (see the upstream-fix guidance in `AGENTS.md`), or a subtle
invariant a future edit could silently break.

## Attach CI labels when you open a PR

Several of `.github/workflows/check.yml`'s jobs are gated behind a label
check, e.g.:

```yaml
if: github.event.action == 'labeled' && github.event.label.name == 'Host 🏡' || github.event.action != 'labeled' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/next' || contains(github.event.pull_request.labels.*.name, 'Host 🏡'))
```

`contains(github.event.pull_request.labels.*.name, …)` reads the labels off
the payload of the event that started the run, and re-running a run replays
the payload it started with — so on its own a label attached after the pull
request was opened would only take effect on the next push. That is what the
first half of the condition is for: the workflow also triggers on `labeled`,
and each gated job claims the `labeled` event carrying its own label.
Attaching a label starts its job, so **never push an empty commit to "kick"
CI.**

The label name in the `if:` condition has to match a real, currently-existing
GitHub label exactly (name and emoji). `host-cpp-tests` checked for a label
literally named `host` for a while, when the repository's real label was
`Host 🏡` — the condition never matched anything anyone would actually apply,
so the job silently only ran on pushes to `main`/`next`. Confirm the label
exists (e.g. via the GitHub MCP `get_label` tool) before trusting a condition
or table like the one below.

The `create_pull_request` GitHub MCP tool has no `labels` parameter, so
labels can only be attached in a follow-up call after the PR exists.
**Whenever you open a PR here:**

1. Decide which of the labels below apply, based on what the diff touches.
2. Attach them immediately after creating the PR (e.g. `issue_write` with
   `method: "update"`, or the equivalent `gh pr edit --add-label`). GitHub
   emits one `labeled` event per label, so a single call attaching several
   labels still starts each of their jobs.
3. Check that each expected job actually started, and re-attach the label if
   one didn't.

## Label → job map

| Label           | Gated job(s)                                                                                                                                                                              | Attach when the diff touches                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Host 🏡`       | Host C++ tests                                                                                                                                                                            | `packages/host/cpp/`, `packages/host/android/CMakeLists.txt`, the generated injector, or anything in `packages/weak-node-api` that the host links against                                                 |
| `Apple 🍎`      | iOS test app build/run                                                                                                                                                                    | iOS/macOS/tvOS/visionOS build config, XCFrameworks, Cocoapods, Xcode project files, or any change to Node-API behavior addons rely on (buffers, fatal-error handling, etc.) that device tests would catch |
| `Android 🤖`    | Android test app build/run (self-hosted runner; currently label-gated even on `main`/`next`, see the `if:` comment in `check.yml` — check whether that's still true before relying on it) | Gradle, NDK, Android SDK, `.android.node` packaging, or the same cross-platform Node-API behavior changes as above                                                                                        |
| `MacOS 💻`      | macOS test app                                                                                                                                                                            | `react-native-macos`-specific code paths                                                                                                                                                                  |
| `Ferric 🦀`     | Ferric Apple triplets build                                                                                                                                                               | `packages/ferric`, `packages/ferric-example`, or anything napi-rs/Cargo related                                                                                                                           |
| `weak-node-api` | weak-node-api tests                                                                                                                                                                       | `packages/weak-node-api`                                                                                                                                                                                  |

A PR can need more than one label — e.g. a change to `RuntimeNodeApi.cpp`
that alters buffer semantics warrants `Host 🏡` plus `Apple 🍎` and
`Android 🤖`, since the actual behavior change can only be verified on a
real device.

When in doubt, prefer attaching a label and letting the job run (mirroring
what the label's own description says on GitHub) over guessing it isn't
needed — a job that runs and passes costs a bit of CI time; a real device
regression that ships because the label was skipped costs much more.
