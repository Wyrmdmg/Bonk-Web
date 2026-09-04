import { afterEach, expect, test } from "bun:test";
import { MAX_POLL_MS, nextDelay, pollFailures, recordPollResult, resetPollHealth } from "./poll";

afterEach(resetPollHealth);

test("a healthy backend polls at the base rate", () => {
  expect(nextDelay(10_000, 0)).toBe(10_000);
});

test("each consecutive failure doubles the wait", () => {
  expect(nextDelay(1000, 1)).toBe(2000);
  expect(nextDelay(1000, 2)).toBe(4000);
  expect(nextDelay(1000, 3)).toBe(8000);
});

test("backoff is capped, so a recovered backend is always retried", () => {
  expect(nextDelay(10_000, 5)).toBe(MAX_POLL_MS);
  expect(nextDelay(10_000, 99)).toBe(MAX_POLL_MS);
  expect(nextDelay(60_000, 3)).toBe(MAX_POLL_MS);
});

test("failures accumulate and one success clears them", () => {
  // This is the self-healing part: while the pool is exhausted every poller
  // slows down together, and the first request that gets through speeds them
  // all back up.
  recordPollResult(false);
  recordPollResult(false);
  expect(pollFailures()).toBe(2);
  recordPollResult(true);
  expect(pollFailures()).toBe(0);
});

test("a tick with nothing to do leaves the health signal alone", () => {
  recordPollResult(false);
  recordPollResult(undefined);
  expect(pollFailures()).toBe(1);
});
