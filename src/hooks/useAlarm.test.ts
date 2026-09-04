import { afterEach, expect, test } from "bun:test";
import {
  getAlarmSettings,
  normalizeAlarmSettings,
  setAlarmSettings,
  type AlarmSettings,
} from "./useAlarm";

const DEFAULTS = normalizeAlarmSettings(null);

afterEach(() => {
  setAlarmSettings(DEFAULTS);
});

test("the default break sounds are the ones labelled default, not the buzzer", () => {
  expect(DEFAULTS.breakStartSound).toBe("breakStart");
  expect(DEFAULTS.breakEndSound).toBe("breakEnd");
});

test("normalize merges a partial over the defaults", () => {
  const s = normalizeAlarmSettings({ breakEndSound: "classic" });
  expect(s.breakEndSound).toBe("classic");
  expect(s.breakStartSound).toBe(DEFAULTS.breakStartSound);
  expect(s.enabled).toBe(DEFAULTS.enabled);
});

test("normalize rejects an unknown sound id and clamps volume", () => {
  const s = normalizeAlarmSettings({
    breakStartSound: "does-not-exist" as AlarmSettings["breakStartSound"],
    volume: 9,
  });
  expect(s.breakStartSound).toBe(DEFAULTS.breakStartSound);
  expect(s.volume).toBe(1);
});

test("every caller reads one shared settings value", () => {
  // The panel writes; the timer reads. Before this was a shared store they
  // were separate useState copies and the timer kept firing the old sound.
  setAlarmSettings({ breakEndSound: "classic" });
  expect(getAlarmSettings().breakEndSound).toBe("classic");

  setAlarmSettings({ breakEndSound: "breakStart" });
  expect(getAlarmSettings().breakEndSound).toBe("breakStart");
});
