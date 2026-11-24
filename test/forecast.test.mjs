import assert from "node:assert/strict";
import test from "node:test";
import { dayLabel, emojiOf, readForecast, weekdayOf } from "../src/types.ts";

// 48 小时：index 0..23 是 11-24，24..47 是 11-25，正好让温度等于下标。
const times = Array.from({ length: 48 }, (_, i) => {
  const day = i < 24 ? "2026-11-24" : "2026-11-25";
  const hh = String(i % 24).padStart(2, "0");
  return `${day}T${hh}:00`;
});

const days = Array.from({ length: 7 }, (_, i) => `2026-11-${String(24 + i).padStart(2, "0")}`);

function fixture() {
  return {
    current: {
      time: "2026-11-24T20:40",
      temperature_2m: 7.4,
      apparent_temperature: 3.2,
      relative_humidity_2m: 63,
      surface_pressure: 1032,
      cloud_cover: 0,
      weather_code: 0,
      is_day: 0,
    },
    hourly: {
      time: times,
      temperature_2m: times.map((_, i) => i),
      weather_code: times.map(() => 3),
      wind_speed_10m: times.map(() => 9.6),
      precipitation_probability: times.map((_, i) => (i === 21 ? 80 : 5)),
      precipitation: times.map((_, i) => (i === 21 ? 0.4 : 0)),
      is_day: times.map(() => 0),
    },
    daily: {
      time: days,
      weather_code: days.map(() => 61),
      temperature_2m_max: days.map((_, i) => 11 + i),
      temperature_2m_min: days.map((_, i) => 4 + i),
      sunrise: days.map(() => "2026-11-24T06:32"),
      sunset: days.map(() => "2026-11-24T16:53"),
      uv_index_max: days.map(() => 4.04),
    },
  };
}

const input = {
  source: "auto",
  query: "",
  city: "南通, 江苏",
  unit: "°C",
  lookahead: 2,
  threshold: 50,
  now: Date.parse("2026-11-24T20:40:00"),
};

test("readForecast keeps the location source it was given", () => {
  assert.equal(readForecast(fixture(), input).source, "auto");
  assert.equal(readForecast(fixture(), { ...input, source: "manual", query: "南通" }).query, "南通");
});

test("readForecast starts at the current hour and keeps 24", () => {
  const state = readForecast(fixture(), input);

  assert.equal(state.ok, true);
  assert.equal(state.city, "南通, 江苏");
  assert.equal(state.temp, 7, "温度取整");
  assert.equal(state.unit, "°C");
  assert.equal(state.isDay, false);

  assert.equal(state.hours.length, 24);
  assert.equal(state.hours[0].label, "现在");
  assert.equal(state.hours[0].temp, 20, "第一条是 20:00");
  assert.equal(state.hours[1].label, "21:00");
  assert.equal(state.hours[1].wind, 10, "风速四舍五入");
  assert.equal(state.hours[0].isDay, false);
});

test("readForecast maps seven days with 今天 / 明天 / 星期", () => {
  const state = readForecast(fixture(), input);

  assert.equal(state.days.length, 7);
  assert.deepEqual(
    state.days.map((d) => d.label),
    ["今天", "明天", "星期四", "星期五", "星期六", "星期日", "星期一"],
  );
  assert.equal(state.days[0].hi, 11);
  assert.equal(state.days[0].lo, 4);
  assert.equal(state.days[0].code, 61);
});

test("readForecast keeps the detail numbers the panel shows", () => {
  const state = readForecast(fixture(), input);

  assert.deepEqual(state.sun, { rise: "06:32", set: "16:53" });
  assert.equal(state.now.feels, 3);
  assert.equal(state.now.humidity, 63);
  assert.equal(state.now.pressure, 1032);
  assert.equal(state.now.cloud, 0);
  assert.equal(state.now.uv, 4, "紫外线保留一位小数");
  assert.equal(state.now.prob, 5, "当前小时的降水概率");
});

test("readForecast picks up rain inside the lookahead window", () => {
  const state = readForecast(fixture(), input);

  assert.ok(state.rain);
  assert.equal(state.rain.at, "21:00");
  assert.equal(state.rain.prob, 80);
  assert.equal(state.rain.raining, false);

  const near = readForecast(fixture(), { ...input, lookahead: 1 });
  assert.equal(near.rain, null, "只看一小时就看不到 21:00 的雨");
});

test("readForecast survives missing sections", () => {
  const state = readForecast({ current: { time: "2026-11-24T20:40" } }, input);

  assert.equal(state.ok, true);
  assert.deepEqual(state.hours, []);
  assert.deepEqual(state.days, []);
  assert.equal(state.sun, null);
  assert.equal(state.now.uv, null);
  assert.equal(state.temp, null);
});

test("labels and emoji", () => {
  assert.equal(weekdayOf("2026-11-26"), "星期四");
  assert.equal(dayLabel("2026-11-24", "2026-11-24"), "今天");
  assert.equal(dayLabel("2026-11-25", "2026-11-24"), "明天");
  assert.equal(dayLabel("2026-11-26", "2026-11-24"), "星期四");

  assert.equal(emojiOf(0, true), "☀️");
  assert.equal(emojiOf(0, false), "🌙");
  assert.equal(emojiOf(3), "☁️");
  assert.equal(emojiOf(61), "🌧️");
  assert.equal(emojiOf(95), "⛈️");
});
