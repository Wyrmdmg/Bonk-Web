import { useEffect, useRef } from "react";

export const MAX_POLL_MS = 60_000;
const MAX_FAILURES = 5;

// One health signal shared by every poller in the app, because they all lean
// on the same backend. When the room poll starts timing out there is no point
// in the XP poll carrying on at full speed - that is exactly how PostgREST ran
// out of pool connections: every client held its normal rate while requests
// were already failing, so the pool never got a chance to drain. A failure
// anywhere slows everything down; a success anywhere speeds it back up.
let failures = 0;

/** Wait before the next run: doubles per consecutive failure, capped so a
 *  backend that recovers is always retried within MAX_POLL_MS. */
export function nextDelay(baseMs: number, fails: number): number {
  return Math.min(baseMs * 2 ** Math.min(fails, MAX_FAILURES), MAX_POLL_MS);
}

export function pollFailures(): number {
  return failures;
}

export function recordPollResult(result: unknown) {
  if (result === false) failures = Math.min(failures + 1, MAX_FAILURES);
  else if (result === true) failures = 0;
}

/** Test seam: the module-level counter outlives any one component. */
export function resetPollHealth() {
  failures = 0;
}

/**
 * A polling loop that yields instead of piling on.
 *
 * - nothing runs while the tab is hidden; coming back refreshes immediately
 * - one run at a time, never overlapping
 * - `fn` returning `false` counts as a failure and backs every poller off,
 *   `true` counts as a success and clears the backoff, and anything else
 *   (the loop had nothing to do this tick) leaves the health signal alone
 *
 * `runWhenHidden` is for presence only. Backgrounding the tab is normal during
 * a focus session, so a heartbeat that stopped there would have the server reap
 * the member as a ghost. Browsers throttle background timers to about once a
 * minute, which is still well inside the server's two minute timeout.
 */
export function usePoll(fn: () => unknown, baseMs: number, enabled = true, runWhenHidden = false) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let running = false;

    const schedule = () => {
      if (stopped) return;
      // Spread clients out so a roomful of them doesn't wake in the same tick.
      const jitter = 0.85 + Math.random() * 0.3;
      timer = setTimeout(run, nextDelay(baseMs, failures) * jitter);
    };

    const run = async () => {
      if (stopped || running) return;
      if (!runWhenHidden && document.visibilityState === "hidden") {
        schedule();
        return;
      }
      running = true;
      try {
        recordPollResult(await fnRef.current());
      } catch {
        recordPollResult(false);
      } finally {
        running = false;
        schedule();
      }
    };

    schedule();

    const onVisibility = () => {
      if (stopped || document.visibilityState !== "visible") return;
      clearTimeout(timer);
      run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [baseMs, enabled, runWhenHidden]);
}
