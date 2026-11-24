// 预览用的固定数据：build/panel.html 与 docs/preview.png 都从这里取，
// 两边的城市、温度、天气代码才不会各写一份、越走越偏。
import {
  readForecast,
  type RawForecast,
  type WeatherState,
} from "../src/types.ts";

const codes = [
  2, 2, 1, 1, 2, 3, 3, 61, 61, 61, 3, 3, 2, 2, 1, 0, 0, 0, 1, 2, 2, 3, 3, 2,
];
const temps = [13, 13, 12, 12, 11, 10, 9, 9, 8, 8, 7, 7, 7, 6, 6, 6, 6, 7, 8, 9, 10, 11, 12, 12];
const probs = [5, 5, 5, 5, 10, 15, 30, 60, 65, 55, 40, 25, 15, 10, 5, 5, 5, 5, 5, 5, 10, 15, 20, 15];

const hours = Array.from({ length: 24 }, (_, i) => {
  const hh = String((14 + i) % 24).padStart(2, "0");
  const day = 14 + i < 24 ? "2026-11-24" : "2026-11-25";
  return { time: `${day}T${hh}:00`, temp: temps[i], code: codes[i], wind: 8 + (i % 7), prob: probs[i] };
});

const daySeed = [
  { code: 2, hi: 17, lo: 8 },
  { code: 61, hi: 14, lo: 9 },
  { code: 3, hi: 15, lo: 9 },
  { code: 0, hi: 17, lo: 7 },
  { code: 2, hi: 16, lo: 8 },
  { code: 0, hi: 18, lo: 9 },
  { code: 80, hi: 15, lo: 10 },
];

export const SAMPLE_RAW: RawForecast = {
  current: {
    time: "2026-11-24T14:20",
    temperature_2m: 13.4,
    apparent_temperature: 11.2,
    relative_humidity_2m: 58,
    surface_pressure: 1024,
    cloud_cover: 35,
    weather_code: 2,
    is_day: 1,
  },
  hourly: {
    time: hours.map((h) => h.time),
    temperature_2m: hours.map((h) => h.temp),
    weather_code: hours.map((h) => h.code),
    wind_speed_10m: hours.map((h) => h.wind),
    precipitation_probability: hours.map((h) => h.prob),
    precipitation: hours.map((h) => (h.prob >= 55 ? 0.3 : 0)),
    is_day: hours.map((h) =>
      h.temp >= 7 && h.time.slice(11, 13) >= "07" && h.time.slice(11, 13) < "17" ? 1 : 0,
    ),
  },
  daily: {
    time: daySeed.map((_, i) => `2026-11-${String(24 + i).padStart(2, "0")}`),
    weather_code: daySeed.map((d) => d.code),
    temperature_2m_max: daySeed.map((d) => d.hi),
    temperature_2m_min: daySeed.map((d) => d.lo),
    sunrise: daySeed.map(() => "2026-11-24T06:32"),
    sunset: daySeed.map(() => "2026-11-24T16:53"),
    uv_index_max: daySeed.map(() => 3.4),
  },
};

const AT = Date.parse("2026-11-24T14:20:00");

export function sampleStates(): {
  auto: WeatherState;
  manual: WeatherState;
  empty: WeatherState;
  failed: WeatherState;
} {
  const auto = readForecast(SAMPLE_RAW, {
    source: "auto",
    query: "",
    city: "南通, 江苏",
    unit: "°C",
    lookahead: 2,
    threshold: 50,
    now: AT,
  });
  const manual = readForecast(SAMPLE_RAW, {
    source: "manual",
    query: "南通",
    city: "南通, 江苏",
    unit: "°C",
    lookahead: 2,
    threshold: 50,
    now: AT,
  });

  return {
    auto,
    manual,
    empty: { ...auto, ok: false, hours: [], days: [], rain: null, error: "还没设置城市" },
    failed: { ...auto, ok: false, hours: [], days: [], rain: null, error: "定位失败，请手动填城市" },
  };
}
