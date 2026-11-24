import assert from "node:assert/strict";
import test from "node:test";
import { rainAhead, shouldNotifyRain } from "../src/types.ts";

// 面板里的 hours 已经是「现在」开头的一段，所以这里按下标算距离。
const hour = (label, prob, mm) => ({
  time: `2026-11-24T${label}:00`,
  label,
  temp: 10,
  code: 3,
  wind: 9,
  prob,
  mm,
  isDay: false,
});

test("rainAhead finds the first wet hour inside the window", () => {
  const hours = [hour("20:00", 10, 0), hour("21:00", 70, 0.4), hour("22:00", 90, 1.2)];

  const rain = rainAhead(hours, 50, 2);
  assert.ok(rain);
  assert.equal(rain.at, "21:00");
  assert.equal(rain.minutes, 60);
  assert.equal(rain.prob, 70);
  assert.equal(rain.raining, false);
});

test("the lookahead decides how far ahead it looks", () => {
  const hours = [hour("20:00", 10, 0), hour("21:00", 20, 0), hour("22:00", 80, 0.5)];

  assert.equal(rainAhead(hours, 50, 1), null, "只看一小时时，22:00 还太远");
  assert.ok(rainAhead(hours, 50, 2) === null, "两小时也只看到 21:00");
  assert.ok(rainAhead(hours, 50, 3), "三小时才能覆盖 22:00");
});

test("the current hour means it is already raining", () => {
  const hours = [hour("20:00", 80, 0.6), hour("21:00", 80, 0.6), hour("22:00", 10, 0)];
  const rain = rainAhead(hours, 50, 2);

  assert.ok(rain);
  assert.equal(rain.raining, true);
  assert.equal(rain.minutes, 0);
});

test("rainAhead needs both probability and actual rain", () => {
  // 概率高但雨量是 0：预报里很常见，不能当成要下雨
  const hours = [hour("20:00", 0, 0), hour("21:00", 80, 0)];
  assert.equal(rainAhead(hours, 50, 2), null);
  assert.equal(rainAhead([], 50, 2), null);
});

test("shouldNotifyRain fires once per cooldown and never while raining", () => {
  const now = Date.parse("2026-11-24T20:30:00");
  const soon = { prob: 70, minutes: 60, at: "21:00", raining: false };

  assert.equal(shouldNotifyRain(soon, 0, now), true);
  assert.equal(shouldNotifyRain(soon, now - 30 * 60_000, now), false, "半小时内不重复");
  assert.equal(shouldNotifyRain(soon, now - 3 * 3_600_000, now), true, "两小时后可以再提醒");
  assert.equal(shouldNotifyRain({ ...soon, raining: true }, 0, now), false, "已经在下就不提醒");
  assert.equal(shouldNotifyRain(null, 0, now), false);
});
