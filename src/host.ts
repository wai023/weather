/// <reference types="node" />
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Context } from "fuyu-plugin";
import { messagesV1 } from "fuyu-plugin/services";
import { pickPlace, readIpPlace, readReversePlace, type Place } from "./geo.ts";
import {
  ALERT_COOLDOWN_MS,
  DEFAULT_CONFIG,
  INITIAL_STATE,
  LOCATE_FAILED,
  METHODS,
  NO_CITY,
  TOPICS,
  normalizeConfig,
  readForecast,
  shouldNotifyRain,
  type RawForecast,
  type WeatherConfig,
  type WeatherState,
} from "./types.ts";

export const name = "weather";
export const inject = {
  clients: null,
  commands: null,
  "messages/v1": null,
};

// 接口偶尔慢，12 秒还没回来就当这次失败，下一轮再取。
const FETCH_TIMEOUT_MS = 12_000;
// 城市解析结果基本不会变，缓存 30 天，省掉重复的地理编码请求。
const GEO_TTL_MS = 30 * 24 * 3_600_000;
// onChange 不可用时靠这个兜底，10 秒比对一次配置文件。
const CONFIG_POLL_MS = 10_000;
const STALE_MS = 10 * 60_000;
const CONFIG_FILE = "config.json";
const GEO_CACHE = "geocode.json";
const LOCATE_CACHE = "locate.json";

// 出口 IP 一般不变，定位结果留 6 小时；手动刷新时 1 分钟内复用，免得连点几次刷爆接口。
const LOCATE_TTL_MS = 6 * 3_600_000;
const LOCATE_FORCE_MS = 60_000;

// 依次试：ipwho.is 是 https 且不要 key；ipapi.co 常按出口 IP 限流；
// ip-api.com 只支持 http，但能直接给中文地名，留作最后一档。
const LOCATE_SOURCES = [
  "https://ipwho.is/",
  "https://ipapi.co/json/",
  "http://ip-api.com/json/?fields=status,country,countryCode,regionName,city,lat,lon&lang=zh-CN",
];
const REVERSE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";

type Notifier = {
  notify: (notice: {
    source: string;
    pluginId?: string;
    title: string;
    body: string;
    durationMs?: number;
  }) => unknown;
};

export function apply(ctx: Context) {
  mkdirSync(ctx.dataDir, { recursive: true });
  const configPath = join(ctx.dataDir, CONFIG_FILE);
  const geoPath = join(ctx.dataDir, GEO_CACHE);
  const locatePath = join(ctx.dataDir, LOCATE_CACHE);

  let state: WeatherState = { ...INITIAL_STATE, updatedAt: Date.now() };
  let config: WeatherConfig = { ...DEFAULT_CONFIG };
  let lastSignature = "";
  // 同一场雨两小时内只提醒一次；雨停了清零，下一场重新算。
  let lastAlertAt = 0;
  let busy = false;
  let stopTimer: (() => Promise<void>) | null = null;

  let messages: Notifier | null = null;
  try {
    messages = ctx.services.get(messagesV1) as unknown as Notifier;
  } catch {
    messages = null;
  }

  function notify(title: string, body: string) {
    try {
      messages?.notify({ source: "weather", pluginId: name, title, body, durationMs: 8000 });
    } catch {
      // 通知不可用不影响取数。
    }
  }

  const signatureOf = () =>
    JSON.stringify([
      state.ok,
      state.source,
      state.city,
      state.temp,
      state.unit,
      state.code,
      state.isDay,
      state.rain,
      state.error,
    ]);

  function publish(force = false) {
    const next = signatureOf();
    if (!force && next === lastSignature) return;
    lastSignature = next;
    ctx.clients.publish(TOPICS.state, state);
  }

  function applyError(message: string) {
    state = { ...state, ok: false, error: message, rain: null };
    publish(true);
  }

  // 配置只由宿主读：窗口侧拿不到 plugin-config 服务，读出来再推给岛上。
  function readConfig(): WeatherConfig {
    try {
      const accessor = (ctx as unknown as { config?: { get?: () => unknown } }).config;
      const values = accessor?.get?.();
      if (values !== undefined) return normalizeConfig(values);
    } catch {
      // 旧版浮屿没有 config 访问器，退回读文件。
    }
    try {
      return normalizeConfig(JSON.parse(readFileSync(configPath, "utf8")));
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function pushConfig(next: WeatherConfig) {
    if (JSON.stringify(next) === JSON.stringify(config)) return;
    config = next;
    ctx.clients.publish(TOPICS.config, config);
  }

  function syncConfig(force = false): WeatherConfig {
    const next = readConfig();
    if (force) {
      config = next;
      ctx.clients.publish(TOPICS.config, config);
      return config;
    }
    pushConfig(next);
    return config;
  }

  // ---- 城市解析缓存：查询词 → 坐标，30 天内复用 ----
  let cache: Record<string, { at: number; place: Place }> | null = null;

  function loadCache() {
    if (cache) return cache;
    try {
      cache = JSON.parse(readFileSync(geoPath, "utf8")) as Record<string, { at: number; place: Place }>;
    } catch {
      cache = {};
    }
    return cache;
  }

  function saveCache() {
    try {
      writeFileSync(geoPath, JSON.stringify(cache ?? {}), "utf8");
    } catch {
      // 缓存写不进去只影响速度，不影响正确性。
    }
  }

  async function getJson(url: string): Promise<unknown> {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`接口返回 ${res.status}`);
    return res.json();
  }

  async function resolvePlace(query: string): Promise<Place> {
    const key = query.toLowerCase();
    const store = loadCache();
    const hit = store[key];
    if (hit && Date.now() - hit.at < GEO_TTL_MS) return hit.place;

    const params = new URLSearchParams({
      name: query,
      count: "5",
      language: "zh",
      format: "json",
    });
    const data = (await getJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`)) as {
      results?: unknown;
    };
    const place = pickPlace(data.results, query);
    if (!place) throw new Error(`找不到这个城市：${query}`);

    store[key] = { at: Date.now(), place };
    saveCache();
    return place;
  }

  // ---- 网络定位：按出口 IP 判断城市，坐标再翻成中文地名 ----
  type Located = { at: number; place: Place };
  let located: Located | null | undefined;

  function loadLocate(): Located | null {
    if (located !== undefined) return located;
    try {
      const raw = JSON.parse(readFileSync(locatePath, "utf8")) as Located;
      located =
        raw && raw.place && Number.isFinite(Number(raw.place.latitude)) ? raw : null;
    } catch {
      located = null;
    }
    return located;
  }

  async function reverseName(latitude: number, longitude: number): Promise<string> {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      localityLanguage: "zh",
    });
    const data = await getJson(`${REVERSE_URL}?${params}`);
    return readReversePlace(data, latitude, longitude)?.label ?? "";
  }

  async function locateNetwork(): Promise<Place | null> {
    for (const url of LOCATE_SOURCES) {
      try {
        const place = readIpPlace(await getJson(url));
        if (!place) continue;
        // IP 库给的多是英文名，换一份中文地名；换不到就先用它自己的。
        try {
          const label = await reverseName(place.latitude, place.longitude);
          if (label) return { ...place, label };
        } catch {
          // 反向编码失败不影响定位结果。
        }
        return place;
      } catch {
        // 这一档不通就换下一档。
      }
    }
    return null;
  }

  async function locate(force: boolean): Promise<Place | null> {
    const hit = loadLocate();
    const limit = force ? LOCATE_FORCE_MS : LOCATE_TTL_MS;
    if (hit && Date.now() - hit.at < limit) return hit.place;

    const place = await locateNetwork();
    if (place) {
      located = { at: Date.now(), place };
      try {
        writeFileSync(locatePath, JSON.stringify(located), "utf8");
      } catch {
        // 写不进去下次再定位一遍，不影响这次显示。
      }
      return place;
    }
    // 全部不通时接着用上次的城市，总比整块空白强。
    return hit?.place ?? null;
  }

  function maybeAlert(cfg: WeatherConfig) {
    if (!state.rain) {
      lastAlertAt = 0;
      return;
    }
    if (!cfg.rainAlert) return;
    if (!shouldNotifyRain(state.rain, lastAlertAt, Date.now(), ALERT_COOLDOWN_MS)) return;

    const r = state.rain;
    const when = r.minutes <= 15 ? "马上" : `约 ${r.at}`;
    notify("快下雨了", `${state.city} ${when}有雨，降水概率 ${r.prob}%，记得带伞`);
    lastAlertAt = Date.now();
  }

  async function refresh(force = false): Promise<WeatherState> {
    if (busy) return state;
    busy = true;
    try {
      const cfg = force ? syncConfig(true) : config;
      let place: Place;
      if (cfg.source === "auto") {
        const found = await locate(force);
        if (!found) {
          applyError(LOCATE_FAILED);
          return state;
        }
        place = found;
      } else {
        if (!cfg.city) {
          applyError(NO_CITY);
          return state;
        }
        place = await resolvePlace(cfg.city);
      }

      const units = cfg.units === "fahrenheit" ? "fahrenheit" : "celsius";
      const params = new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current:
          "temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,cloud_cover,weather_code,is_day",
        hourly:
          "temperature_2m,weather_code,wind_speed_10m,precipitation_probability,precipitation,is_day",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max",
        forecast_days: "7",
        timezone: "auto",
        temperature_unit: units,
      });
      const data = (await getJson(
        `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
      )) as RawForecast;

      if (!data.hourly?.time?.length) throw new Error("接口没有返回逐小时数据");

      state = readForecast(data, {
        source: cfg.source,
        query: cfg.source === "manual" ? cfg.city : "",
        city: place.label,
        unit: units === "celsius" ? "°C" : "°F",
        lookahead: cfg.rainLookahead,
        threshold: cfg.rainThreshold,
        now: Date.now(),
      });
      publish(true);
      maybeAlert(cfg);
    } catch (err) {
      applyError(err instanceof Error ? err.message : "读取失败");
    } finally {
      busy = false;
    }
    return state;
  }

  function arm() {
    if (stopTimer) {
      void stopTimer();
      stopTimer = null;
    }
    stopTimer = ctx.setInterval(() => {
      void refresh();
    }, config.refresh * 60_000);
  }

  ctx.clients.handle(METHODS.getState, () => {
    // 超过十分钟没更新过，顺手取一次，别让收起条一直显示旧温度。
    if (Date.now() - state.updatedAt > STALE_MS) void refresh();
    return state;
  });
  ctx.clients.handle(METHODS.getConfig, () => syncConfig());
  ctx.clients.handle(METHODS.refresh, () => refresh(true));

  ctx.commands.register("refresh", () => refresh(true), {
    title: { "zh-CN": "刷新天气", en: "Refresh weather" },
  });

  // 设置保存后立刻生效：改城市或单位都重新解析、重新取数。
  try {
    const accessor = (ctx as unknown as {
      config?: { onChange?: (listener: (values: unknown) => void) => unknown };
    }).config;
    accessor?.onChange?.((values) => {
      const next = normalizeConfig(values);
      const changed = JSON.stringify(next) !== JSON.stringify(config);
      pushConfig(next);
      if (changed) {
        arm();
        void refresh(true);
      }
    });
  } catch {
    // 旧版浮屿没有 onChange，继续走下面的轮询。
  }

  syncConfig(true);
  arm();
  void refresh(true);

  ctx.setInterval(() => {
    const next = readConfig();
    if (JSON.stringify(next) === JSON.stringify(config)) return;
    pushConfig(next);
    arm();
    void refresh(true);
  }, CONFIG_POLL_MS);
}
