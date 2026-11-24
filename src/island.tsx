import type { Context } from "fuyu-plugin";
import { useEffect, useState } from "react";
import {
  DEFAULT_CONFIG,
  INITIAL_STATE,
  METHODS,
  TOPICS,
  normalizeConfig,
  weatherOf,
  type WeatherConfig,
  type WeatherKind,
  type WeatherState,
} from "./types.ts";
import { text } from "./text.ts";
import { PanelView } from "./panel.tsx";
import "./styles.css";

function tooltip(state: WeatherState, config: WeatherConfig): string {
  if (!state.ok) return state.error || text.failed;
  const info = weatherOf(state.code);
  const parts = [`${state.city} ${state.temp ?? "--"}${state.unit}`, info.zh];
  if (state.rain) parts.push(`${state.rain.at} 前后有雨，概率 ${state.rain.prob}%`);
  if (state.source === "auto") parts.push(text.located);
  if (config.source === "manual" && !config.city) parts.push(text.noCity);
  return parts.join(" · ");
}

// 收起条只有 16px，图标用实心块拼，比线性图标在小尺寸下更容易辨认。
function Glyph({ kind }: { kind: WeatherKind }) {
  const body = () => {
    switch (kind) {
      case "sun":
        return (
          <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />
            <line x1="8" y1="1.2" x2="8" y2="3" />
            <line x1="8" y1="13" x2="8" y2="14.8" />
            <line x1="1.2" y1="8" x2="3" y2="8" />
            <line x1="13" y1="8" x2="14.8" y2="8" />
            <line x1="3.4" y1="3.4" x2="4.7" y2="4.7" />
            <line x1="11.3" y1="11.3" x2="12.6" y2="12.6" />
            <line x1="12.6" y1="3.4" x2="11.3" y2="4.7" />
            <line x1="4.7" y1="11.3" x2="3.4" y2="12.6" />
          </g>
        );
      case "night":
        return <path d="M9.6 2.4a5.8 5.8 0 1 0 0 11.2A7 7 0 0 1 9.6 2.4Z" fill="currentColor" />;
      case "rain":
        return (
          <g fill="currentColor">
            <circle cx="6" cy="7.4" r="2.6" />
            <circle cx="9.4" cy="6" r="3.4" />
            <circle cx="11.4" cy="7.6" r="2.2" />
            <rect x="5.4" y="7" width="6.6" height="3.4" rx="1.7" />
            <rect x="5.2" y="11.4" width="1.2" height="3" rx=".6" />
            <rect x="8" y="12.2" width="1.2" height="2.6" rx=".6" />
            <rect x="10.8" y="11.4" width="1.2" height="3" rx=".6" />
          </g>
        );
      case "snow":
        return (
          <g fill="currentColor">
            <circle cx="6" cy="7.4" r="2.6" />
            <circle cx="9.4" cy="6" r="3.4" />
            <circle cx="11.4" cy="7.6" r="2.2" />
            <rect x="5.4" y="7" width="6.6" height="3.4" rx="1.7" />
            <circle cx="6" cy="13" r="1" />
            <circle cx="9.6" cy="13.6" r="1" />
          </g>
        );
      case "fog":
        return (
          <g fill="currentColor">
            <circle cx="6" cy="6.4" r="2.6" />
            <circle cx="9.4" cy="5" r="3.4" />
            <circle cx="11.4" cy="6.6" r="2.2" />
            <rect x="5.4" y="6" width="6.6" height="3.4" rx="1.7" />
            <rect x="3.4" y="11" width="9.2" height="1.3" rx=".65" />
            <rect x="5.6" y="13.6" width="7" height="1.3" rx=".65" />
          </g>
        );
      case "thunder":
        return (
          <g fill="currentColor">
            <circle cx="6" cy="7" r="2.6" />
            <circle cx="9.4" cy="5.6" r="3.4" />
            <circle cx="11.4" cy="7.2" r="2.2" />
            <rect x="5.4" y="6.6" width="6.6" height="3.4" rx="1.7" />
            <path d="M8.6 10.2h2.6l-2 2.8h1.8l-3.4 3 1-2.6H6.2z" />
          </g>
        );
      default:
        return (
          <g fill="currentColor">
            <circle cx="6" cy="8.6" r="2.8" />
            <circle cx="9.6" cy="7" r="3.8" />
            <circle cx="11.8" cy="8.8" r="2.4" />
            <rect x="5.2" y="8" width="7.6" height="3.8" rx="1.9" />
          </g>
        );
    }
  };

  return (
    <svg className="weather-bar__glyph" viewBox="0 0 16 16" aria-hidden="true">
      {body()}
    </svg>
  );
}

// 面板页的图标：小尺寸下实心太阳比线性图标清楚。
function WeatherIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <circle cx="8" cy="8" r="3.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <line x1="8" y1="1.2" x2="8" y2="3" />
        <line x1="8" y1="13" x2="8" y2="14.8" />
        <line x1="1.2" y1="8" x2="3" y2="8" />
        <line x1="13" y1="8" x2="14.8" y2="8" />
        <line x1="3.4" y1="3.4" x2="4.7" y2="4.7" />
        <line x1="11.3" y1="11.3" x2="12.6" y2="12.6" />
        <line x1="12.6" y1="3.4" x2="11.3" y2="4.7" />
        <line x1="4.7" y1="11.3" x2="3.4" y2="12.6" />
      </g>
    </svg>
  );
}

export default function apply(ctx: Context) {
  function useWeather(): WeatherState {
    const [state, setState] = useState<WeatherState>(INITIAL_STATE);

    useEffect(() => {
      const off = ctx.host.on(TOPICS.state, (next: WeatherState) => setState(next));
      void ctx.host.call(METHODS.getState).then((value) => setState(value as WeatherState));
      return () => {
        void off();
      };
    }, []);

    return state;
  }

  function useSettings(): WeatherConfig {
    const [config, setConfig] = useState<WeatherConfig>(DEFAULT_CONFIG);

    useEffect(() => {
      let alive = true;
      const applyValues = (values: unknown) => {
        if (alive) setConfig(normalizeConfig(values));
      };
      const off = ctx.host.on(TOPICS.config, applyValues);
      void ctx.host.call(METHODS.getConfig).then(applyValues).catch(() => {
        // 宿主没实现时用默认值，收起条照常显示读数。
      });
      return () => {
        alive = false;
        void off();
      };
    }, []);

    return config;
  }

  function Page() {
    const state = useWeather();

    return (
      <PanelView
        state={state}
        onRefresh={() => void ctx.host.call(METHODS.refresh)}
        onSettings={() => void ctx.settings.open()}
      />
    );
  }

  function BarItem() {
    const state = useWeather();
    const config = useSettings();
    const info = weatherOf(state.code);
    const kind: WeatherKind = !state.isDay && info.kind === "sun" ? "night" : info.kind;
    const temp = state.ok && state.temp !== null ? `${state.temp}${state.unit}` : "--";

    return (
      <div
        className={`weather-bar${state.ok ? "" : " weather-bar--off"}`}
        title={tooltip(state, config)}
        onClick={() => void ctx.host.call(METHODS.refresh)}
      >
        <Glyph kind={kind} />
        <span className="weather-bar__temp">{temp}</span>
      </div>
    );
  }

  ctx.slots.add("island.page/v1", {
    id: "weather",
    title: { "zh-CN": "天气", en: "Weather" },
    component: Page,
    icon: WeatherIcon,
  });

  ctx.slots.add("island.collapsed/v1", {
    id: "weather-bar",
    label: { "zh-CN": "天气", en: "Weather" },
    opens: "weather",
    component: BarItem,
  });
}
