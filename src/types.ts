export type Units = "celsius" | "fahrenheit";

// 两条取位置的路径：auto 按网络出口判断所在城市，manual 用设置里填的城市。
export type LocationSource = "auto" | "manual";

export type WeatherConfig = {
  source: LocationSource;
  city: string;
  units: Units;
  rainAlert: boolean;
  // 看未来几小时有没有雨
  rainLookahead: number;
  // 降水概率阈值，百分比
  rainThreshold: number;
  // 刷新间隔，分钟
  refresh: number;
};

export const DEFAULT_CONFIG: WeatherConfig = {
  source: "auto",
  city: "",
  units: "celsius",
  rainAlert: true,
  rainLookahead: 2,
  rainThreshold: 50,
  refresh: 15,
};

// 设置项在 schema 里是字符串枚举（宿主的下拉框只认字符串），这里统一转回数字。
const UNITS: Units[] = ["celsius", "fahrenheit"];
const LOOKAHEAD = [1, 2, 3];
const THRESHOLDS = [30, 50, 70];
const REFRESH = [10, 15, 30, 60];

function pickNumber(value: unknown, allowed: number[], fallback: number): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return allowed.includes(n) ? n : fallback;
}

export function normalizeConfig(values: unknown): WeatherConfig {
  const raw = (values ?? {}) as Record<string, unknown>;
  const city = typeof raw.city === "string" ? raw.city.trim() : "";
  // 老版本没有这个字段：填过城市的继续按手动走，从来没填过的默认自动定位。
  const source: LocationSource =
    raw.source === "manual" || raw.source === "auto"
      ? raw.source
      : city
        ? "manual"
        : DEFAULT_CONFIG.source;
  const units =
    typeof raw.units === "string" && (UNITS as string[]).includes(raw.units)
      ? (raw.units as Units)
      : DEFAULT_CONFIG.units;

  return {
    source,
    city,
    units,
    rainAlert: typeof raw.rainAlert === "boolean" ? raw.rainAlert : DEFAULT_CONFIG.rainAlert,
    rainLookahead: pickNumber(raw.rainLookahead, LOOKAHEAD, DEFAULT_CONFIG.rainLookahead),
    rainThreshold: pickNumber(raw.rainThreshold, THRESHOLDS, DEFAULT_CONFIG.rainThreshold),
    refresh: pickNumber(raw.refresh, REFRESH, DEFAULT_CONFIG.refresh),
  };
}

export type RainHint = {
  // 命中那个小时的降水概率
  prob: number;
  // 距离开始下雨还有多少分钟，正在下时为 0
  minutes: number;
  // 开始的那个整点，HH:mm
  at: string;
  // 当前这个小时就已经在下
  raining: boolean;
};

export type HourItem = {
  // 接口给的本地时间，不带时区，例如 2026-11-24T21:00
  time: string;
  // 「现在」或「21:00」
  label: string;
  temp: number;
  code: number;
  wind: number;
  prob: number;
  mm: number;
  isDay: boolean;
};

export type DayItem = {
  date: string;
  // 「今天」「明天」或「星期四」
  label: string;
  code: number;
  hi: number;
  lo: number;
};

export type NowExtra = {
  feels: number | null;
  humidity: number | null;
  pressure: number | null;
  cloud: number | null;
  uv: number | null;
  prob: number | null;
};

export type SunTimes = {
  rise: string;
  set: string;
};

export type WeatherState = {
  ok: boolean;
  // 这次数据是按哪种方式定位的
  source: LocationSource;
  // 设置里填的原文；自动定位时为空
  query: string;
  // 解析出来的地名，例如「南通, 江苏」
  city: string;
  temp: number | null;
  // 「°C」或「°F」
  unit: string;
  code: number | null;
  isDay: boolean;
  rain: RainHint | null;
  // 从当前整点开始的 24 条
  hours: HourItem[];
  // 今天起的 7 天
  days: DayItem[];
  now: NowExtra;
  sun: SunTimes | null;
  updatedAt: number;
  // 空字符串表示正常
  error: string;
};

export const EMPTY_NOW: NowExtra = {
  feels: null,
  humidity: null,
  pressure: null,
  cloud: null,
  uv: null,
  prob: null,
};

export const INITIAL_STATE: WeatherState = {
  ok: false,
  source: DEFAULT_CONFIG.source,
  query: "",
  city: "",
  temp: null,
  unit: "°C",
  code: null,
  isDay: true,
  rain: null,
  hours: [],
  days: [],
  now: EMPTY_NOW,
  sun: null,
  updatedAt: 0,
  error: "",
};

export const TOPICS = {
  state: "weather.state",
  config: "weather.config",
} as const;

// 面板和宿主共用这两个标记，用来区分「没填城市」「定位不上」和「接口出错」。
export const NO_CITY = "还没设置城市";
export const LOCATE_FAILED = "定位失败，请手动填城市";

export const METHODS = {
  getState: "weather.getState",
  getConfig: "weather.getConfig",
  refresh: "weather.refresh",
} as const;

// 面板一次显示 4 列，24 条正好 6 屏。
export const HOUR_COUNT = 24;
export const DAY_COUNT = 7;

// ---- 接口原始数据：只声明用到的字段，缺字段按空处理 ----

export type RawForecast = {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    surface_pressure?: number;
    cloud_cover?: number;
    weather_code?: number;
    is_day?: number;
    wind_speed_10m?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    weather_code?: number[];
    wind_speed_10m?: number[];
    precipitation_probability?: number[];
    precipitation?: number[];
    is_day?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    sunrise?: string[];
    sunset?: string[];
    uv_index_max?: number[];
  };
};

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function weekdayOf(date: string): string {
  const names = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const day = new Date(`${date}T12:00:00`).getDay();
  return names[day] ?? "";
}

export function dayLabel(date: string, today: string): string {
  if (date === today) return "今天";
  const diff = Math.round(
    (Date.parse(`${date}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000,
  );
  if (diff === 1) return "明天";
  return weekdayOf(date);
}

// 从「现在」这一小时往后找第一段会下的雨。
// 接口是逐小时数据，分钟级的「提前 15 分钟」在这里做不出来，
// 所以设置项按小时给，文案也只说「约 22:00 有雨」。
// 只看概率不看雨量会把「可能下」当成「要下」，两个条件都要满足。
export function rainAhead(hours: HourItem[], threshold: number, ahead: number): RainHint | null {
  const window = hours.slice(0, Math.max(1, ahead));
  const i = window.findIndex((h) => h.prob >= threshold && h.mm >= 0.1);
  if (i < 0) return null;
  const hit = window[i]!;
  return {
    prob: hit.prob,
    minutes: i * 60,
    at: hit.time.slice(11, 16),
    raining: i === 0,
  };
}

export const ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000;

export function shouldNotifyRain(
  rain: RainHint | null,
  lastAt: number,
  now: number,
  cooldown = ALERT_COOLDOWN_MS,
): boolean {
  if (!rain || rain.raining) return false;
  return now - lastAt >= cooldown;
}

export type ForecastInput = {
  source: LocationSource;
  query: string;
  city: string;
  unit: string;
  lookahead: number;
  threshold: number;
  now: number;
};

// 把接口返回摊平成面板直接用的一屏数据。
export function readForecast(raw: RawForecast, input: ForecastInput): WeatherState {
  const nowTime = raw.current?.time ?? "";
  const nowHour = nowTime.slice(0, 13);
  const hTimes = raw.hourly?.time ?? [];

  const found = hTimes.findIndex((t) => t.slice(0, 13) === nowHour);
  const start = found >= 0 ? found : 0;

  const hours: HourItem[] = [];
  for (let i = start; i < hTimes.length && hours.length < HOUR_COUNT; i += 1) {
    const temp = roundOrNull(raw.hourly?.temperature_2m?.[i]);
    if (temp === null) continue;
    const time = hTimes[i]!;
    hours.push({
      time,
      label: hours.length === 0 && time.slice(0, 13) === nowHour ? "现在" : time.slice(11, 16),
      temp,
      code: Math.round(num(raw.hourly?.weather_code?.[i])),
      wind: Math.round(num(raw.hourly?.wind_speed_10m?.[i])),
      prob: Math.round(num(raw.hourly?.precipitation_probability?.[i])),
      mm: num(raw.hourly?.precipitation?.[i]),
      isDay: num(raw.hourly?.is_day?.[i], 1) !== 0,
    });
  }

  const dTimes = raw.daily?.time ?? [];
  const today = nowTime.slice(0, 10) || dTimes[0] || "";
  const days: DayItem[] = [];
  for (let i = 0; i < dTimes.length && days.length < DAY_COUNT; i += 1) {
    const hi = roundOrNull(raw.daily?.temperature_2m_max?.[i]);
    const lo = roundOrNull(raw.daily?.temperature_2m_min?.[i]);
    if (hi === null || lo === null) continue;
    const date = dTimes[i]!;
    days.push({
      date,
      label: dayLabel(date, today),
      code: Math.round(num(raw.daily?.weather_code?.[i])),
      hi,
      lo,
    });
  }

  const currentHour = hours[0];
  const rise = raw.daily?.sunrise?.[0] ?? "";
  const set = raw.daily?.sunset?.[0] ?? "";
  const uv = raw.daily?.uv_index_max?.[0];
  const temp = roundOrNull(raw.current?.temperature_2m);
  const code = roundOrNull(raw.current?.weather_code);

  return {
    ok: true,
    source: input.source,
    query: input.query,
    city: input.city,
    temp,
    unit: input.unit,
    code,
    isDay: num(raw.current?.is_day, 1) !== 0,
    rain: rainAhead(hours, input.threshold, input.lookahead),
    hours,
    days,
    now: {
      feels: roundOrNull(raw.current?.apparent_temperature),
      humidity: roundOrNull(raw.current?.relative_humidity_2m),
      pressure: roundOrNull(raw.current?.surface_pressure),
      cloud: roundOrNull(raw.current?.cloud_cover),
      uv: uv === undefined ? null : Math.round(num(uv) * 10) / 10,
      prob: currentHour ? currentHour.prob : null,
    },
    sun: rise && set ? { rise: rise.slice(11, 16), set: set.slice(11, 16) } : null,
    updatedAt: input.now,
    error: "",
  };
}

export type WeatherKind = "sun" | "night" | "cloud" | "rain" | "snow" | "fog" | "thunder";

// WMO 天气代码 → 图标类别与文案
export function weatherOf(code: number | null): { kind: WeatherKind; zh: string; en: string } {
  const c = code ?? 0;
  if (c === 0) return { kind: "sun", zh: "晴", en: "Clear" };
  if (c <= 2) return { kind: "cloud", zh: "少云", en: "Partly cloudy" };
  if (c === 3) return { kind: "cloud", zh: "阴", en: "Overcast" };
  if (c === 45 || c === 48) return { kind: "fog", zh: "雾", en: "Fog" };
  if (c >= 51 && c <= 57) return { kind: "rain", zh: "毛毛雨", en: "Drizzle" };
  if (c >= 61 && c <= 67) return { kind: "rain", zh: "雨", en: "Rain" };
  if (c >= 71 && c <= 77) return { kind: "snow", zh: "雪", en: "Snow" };
  if (c >= 80 && c <= 82) return { kind: "rain", zh: "阵雨", en: "Showers" };
  if (c === 85 || c === 86) return { kind: "snow", zh: "阵雪", en: "Snow showers" };
  if (c >= 95) return { kind: "thunder", zh: "雷阵雨", en: "Thunderstorm" };
  return { kind: "cloud", zh: "多云", en: "Cloudy" };
}

// 面板用 emoji：22~54px 的尺寸下比手绘矢量更有质感，也不用维护两套描边。
export function emojiOf(code: number | null, isDay = true): string {
  const c = code ?? 0;
  if (c === 0) return isDay ? "☀️" : "🌙";
  if (c === 1) return isDay ? "🌤️" : "🌙";
  if (c === 2) return isDay ? "⛅️" : "☁️";
  if (c === 3) return "☁️";
  if (c === 45 || c === 48) return "🌫️";
  if (c >= 51 && c <= 57) return "🌦️";
  if (c >= 61 && c <= 67) return "🌧️";
  if (c >= 71 && c <= 77) return "❄️";
  if (c >= 80 && c <= 82) return "🌦️";
  if (c === 85 || c === 86) return "🌨️";
  if (c >= 95) return "⛈️";
  return "☁️";
}
