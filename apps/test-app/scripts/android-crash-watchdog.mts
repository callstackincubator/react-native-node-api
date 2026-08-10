/**
 * Fails the Android test run as soon as the app crashes.
 *
 * `mocha-remote` waits indefinitely for a client to connect and has no notion
 * of the app dying: when the app crashes on startup, nothing ever connects and
 * the run hangs until the CI job hits its timeout — 68 minutes of an emulator
 * idling for a crash that happened one second after `am start`.
 *
 * Run alongside the app (through `concurrently --kill-others-on-fail`), this
 * turns such a crash into an immediate failure with the stack trace inlined in
 * the log, instead of a timeout with the cause buried in a logcat artifact.
 *
 * It only reacts to crashes: a hung or never-launched app still relies on the
 * job timeout.
 */
import cp from "node:child_process";
import readline from "node:readline";

// The application id used by react-native-test-app, which the CI workflow also
// hardcodes when uninstalling any leftover copy of the app.
const APP_ID = "com.microsoft.reacttestapp";

// How long to keep reading after the first line mentioning the app, to capture
// the rest of the stack trace before exiting.
const TRACE_GRACE_MS = 1000;

/**
 * Runs adb, resolving false if it couldn't run at all (not installed, no
 * device, etc). The watchdog stays out of the way in that case: the build or
 * the run itself will fail with a better message than anything we could add.
 */
function adb(...args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = cp.spawn("adb", args, { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function skip(reason: string): never {
  console.warn(`[crash-watchdog] Not watching for crashes: ${reason}`);
  process.exit(0);
}

async function main() {
  if (!(await adb("wait-for-device"))) {
    skip("failed to wait for an adb device");
  }

  // Drop any crash from an earlier run, so we only react to this one. The app
  // hasn't been installed yet at this point, so this can't discard a crash we
  // care about.
  await adb("logcat", "-b", "crash", "-c");

  // Never let this child inherit our stderr: GitHub's `@actions/exec` resolves
  // a step only once the stdio streams it handed out are closed, so an adb
  // orphaned by our exit would hold the step open long after we failed it.
  const logcat = cp.spawn("adb", ["logcat", "-b", "crash"], {
    stdio: ["ignore", "pipe", "ignore"],
  });

  // ... and don't leave it running at all: killing it on the way out covers
  // both failing on a crash and getting terminated once the tests pass.
  process.on("exit", () => logcat.kill("SIGKILL"));
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => process.exit(0));
  }

  // The line naming the app is preceded by the header of the crash it belongs
  // to ("FATAL EXCEPTION: main"), so keep a few lines of lead-in around.
  const LEAD_IN_LINES = 5;
  const trace: string[] = [];
  let crashed = false;

  logcat.on("error", () => skip("failed to spawn adb logcat"));
  logcat.on("close", () => {
    // Getting killed once the tests pass is the expected way for this to end.
    if (!crashed) {
      skip("adb logcat exited");
    }
  });

  for await (const line of readline.createInterface({ input: logcat.stdout })) {
    trace.push(line);
    if (crashed) {
      continue;
    } else if (line.includes(APP_ID)) {
      crashed = true;
      // Give the rest of the stack trace a moment to arrive before printing it.
      setTimeout(() => {
        console.error(`\n[crash-watchdog] ${APP_ID} crashed:\n`);
        console.error(trace.join("\n"));
        process.exit(1);
      }, TRACE_GRACE_MS);
    } else if (trace.length > LEAD_IN_LINES) {
      trace.shift();
    }
  }
}

await main();
