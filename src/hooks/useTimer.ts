import { useEffect, useRef, useState } from "react";

async function readServerClockOffset(): Promise<number | null> {
  if (typeof window === "undefined") return null;
  const started = Date.now();
  try {
    let res = await fetch(window.location.origin, { method: "HEAD", cache: "no-store" });
    if (!res.ok || !res.headers.get("date")) {
      res = await fetch(`${window.location.origin}/?clock=${started}`, { cache: "no-store" });
    }
    const date = res.headers.get("date");
    if (!date) return null;
    const serverNow = new Date(date).getTime();
    if (!Number.isFinite(serverNow)) return null;
    const received = Date.now();
    return serverNow - Math.round((started + received) / 2);
  } catch {
    return null;
  }
}

function useServerClockOffset() {
  const [offsetMs, setOffsetMs] = useState(0);
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      const offset = await readServerClockOffset();
      if (alive && offset !== null) setOffsetMs(offset);
    };
    sync();
    const interval = window.setInterval(sync, 60_000);
    const onFocus = () => sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return offsetMs;
}

export function useCountdown({
  startedAt,
  durationSec,
  running,
  onComplete,
}: {
  startedAt: string | null;
  durationSec: number;
  running: boolean;
  onComplete?: () => void;
}) {
  const clockOffsetMs = useServerClockOffset();
  const clockOffsetRef = useRef(clockOffsetMs);
  clockOffsetRef.current = clockOffsetMs;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const [remaining, setRemaining] = useState(durationSec);

  useEffect(() => {
    if (!running || !startedAt) {
      setRemaining(durationSec);
      return;
    }
    const startedMs = new Date(startedAt).getTime();
    const initialSnapshot = Math.max(
      0,
      durationSec - (Date.now() + clockOffsetRef.current - startedMs) / 1000,
    );
    // Only fire onComplete when the countdown transitions from >0 to <=0
    // during this mount. If it's already expired on mount, stay silent.
    let fired = initialSnapshot <= 0;
    const compute = () =>
      Math.max(
        0,
        Math.min(
          durationSec,
          durationSec - (Date.now() + clockOffsetRef.current - startedMs) / 1000,
        ),
      );
    const tick = () => {
      const r = compute();
      setRemaining(Math.ceil(r));
      if (r <= 0 && !fired) {
        fired = true;
        onCompleteRef.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 200);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [startedAt, durationSec, running]);

  return remaining;
}

export function useStopwatch({
  startedAt,
  running,
}: {
  startedAt: string | null;
  running: boolean;
}) {
  const clockOffsetMs = useServerClockOffset();
  const clockOffsetRef = useRef(clockOffsetMs);
  clockOffsetRef.current = clockOffsetMs;
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!running || !startedAt) {
      setMs(0);
      return;
    }
    const startedMs = new Date(startedAt).getTime();
    const tick = () => {
      setMs(Math.max(0, Date.now() + clockOffsetRef.current - startedMs));
    };
    tick();
    const id = setInterval(tick, 200);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [startedAt, running]);
  return Math.floor(ms / 1000);
}

export function formatMMSS(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}
