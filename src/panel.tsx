import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  LOCATE_FAILED,
  NO_CITY,
  emojiOf,
  weatherOf,
  type DayItem,
  type HourItem,
  type WeatherState,
} from "./types.ts";

// 版式以 775 宽为准（参考图原尺寸），页面窄了等比缩，但缩到 0.68 就打住，
// 再小字就糊了；那时七天卡片靠横滑看全。
const REF_WIDTH = 775;
const MIN_SCALE = 0.68;
const COLUMNS = 4;

export function scaleOf(width: number): number {
  if (!width) return 1;
  return Math.min(1, Math.max(MIN_SCALE, width / REF_WIDTH));
}

// 鼠标只有竖向滚轮，落到横滑条上就转成横向；触控板和触摸屏本来就横滑。
function wheelToScroll(event: ReactWheelEvent<HTMLElement>) {
  const el = event.currentTarget;
  if (el.scrollWidth <= el.clientWidth + 1) return;
  if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  el.scrollLeft += event.deltaY;
}

function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function value(v: number | null, suffix: string): string {
  return v === null ? "--" : `${v}${suffix}`;
}

function Emoji({ char }: { char: string }) {
  return (
    <span className="wx-emoji" aria-hidden="true">
      {char}
    </span>
  );
}

function DayRow({ days }: { days: DayItem[] }) {
  return (
    <div className="wx-days" onWheel={wheelToScroll}>
      {days.map((day) => (
        <div
          key={day.date}
          className={`wx-day${day.label === "今天" ? " wx-day--today" : ""}`}
          title={`${day.label} ${weatherOf(day.code).zh} ${day.hi}° / ${day.lo}°`}
        >
          <span className="wx-day__label">{day.label}</span>
          <span className="wx-day__icon">
            <Emoji char={emojiOf(day.code, true)} />
          </span>
          <span className="wx-day__hi">{day.hi}°</span>
          <span className="wx-day__lo">{day.lo}°</span>
        </div>
      ))}
    </div>
  );
}

type LineProps = {
  hours: HourItem[];
  page: number;
  min: number;
  max: number;
  scale: number;
};

// 每一屏一段折线：把屏外相邻的点也画进来，跨屏时才不会断头。
function LineLayer({ hours, page, min, max, scale }: LineProps) {
  const start = page * COLUMNS;
  const from = Math.max(0, start - 1);
  const to = Math.min(hours.length - 1, start + COLUMNS);
  const span = max - min;
  const ratio = (t: number) => (span <= 0 ? 0.5 : (max - t) / span);

  const points: { x: number; y: number; inside: boolean }[] = [];
  for (let i = from; i <= to; i += 1) {
    const hour = hours[i];
    if (!hour) continue;
    points.push({
      x: i - start + 0.5,
      y: ratio(hour.temp),
      inside: i >= start && i < start + COLUMNS,
    });
  }

  return (
    <>
      <svg
        className="wx-line"
        viewBox={`0 0 ${COLUMNS} 1`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          points={points.map((p) => `${p.x},${p.y.toFixed(4)}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6 * scale}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="wx-line__dots" aria-hidden="true">
        {points
          .filter((p) => p.inside)
          .map((p) => (
            <i
              key={p.x}
              style={{ left: `${(p.x / COLUMNS) * 100}%`, top: `${p.y * 100}%` }}
            />
          ))}
      </div>
    </>
  );
}

function HourChart({ hours, scale }: { hours: HourItem[]; scale: number }) {
  const track = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(hours.length / COLUMNS));

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = track.current;
      if (!el) return;
      const width = el.clientWidth || 1;
      const next = Math.min(pages - 1, Math.max(0, Math.round(el.scrollLeft / width)));
      setPage((prev) => (prev === next ? prev : next));
    });
  };

  const temps = hours.map((h) => h.temp);
  const max = temps.length ? Math.max(...temps) : 0;
  const min = temps.length ? Math.min(...temps) : 0;

  const go = (index: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  };

  return (
    <section className="wx-chart" aria-label="逐小时">
      <div className="wx-chart__track" ref={track} onScroll={onScroll} onWheel={wheelToScroll}>
        {Array.from({ length: pages }, (_, index) => (
          <div className="wx-page" key={index}>
            <LineLayer hours={hours} page={index} min={min} max={max} scale={scale} />
            <div className="wx-page__cols">
              {hours.slice(index * COLUMNS, index * COLUMNS + COLUMNS).map((hour) => (
                <div className="wx-col" key={hour.time}>
                  <span className="wx-col__temp">{hour.temp}°</span>
                  <span className="wx-col__icon">
                    <Emoji char={emojiOf(hour.code, hour.isDay)} />
                  </span>
                  <span className="wx-col__wind">{hour.wind} km/h</span>
                  <span className="wx-col__time">{hour.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="wx-pager">
          {Array.from({ length: pages }, (_, index) => (
            <button
              key={index}
              type="button"
              className={`wx-pager__dot${index === page ? " is-on" : ""}`}
              aria-label={`第 ${index + 1} 屏`}
              onClick={() => go(index)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type PanelProps = {
  state: WeatherState;
  // 预览时直接给定宽度；插槽里由 ResizeObserver 量。
  width?: number;
  onRefresh?: () => void;
  onSettings?: () => void;
};

export function PanelView({ state, width, onRefresh, onSettings }: PanelProps) {
  const box = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setMeasured(entry.contentRect.width);
    });
    observer.observe(el);
    setMeasured(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const actual = width && width > 0 ? width : measured || REF_WIDTH;
  const scale = scaleOf(actual);
  const style = { "--wx-u": scale } as unknown as CSSProperties;

  if (!state.ok && !state.hours.length) {
    const noCity = state.error === NO_CITY;
    const noLocate = state.error === LOCATE_FAILED;
    return (
      <div className="wx-panel wx-panel--empty" ref={box} style={style}>
        <span className="wx-empty__icon">
          <Emoji char={noCity ? "🌤️" : noLocate ? "📍" : "⚠️"} />
        </span>
        <p className="wx-empty__title">
          {noCity ? NO_CITY : noLocate ? "定位失败" : "天气读取失败"}
        </p>
        <p className="wx-empty__text">
          {noCity
            ? "在设置里填城市名，中文或拼音都行，例如「南通」"
            : noLocate
              ? "网络定位没拿到位置，重试一次；还不行就在设置里把定位方式改成「手动」直接填城市"
              : state.error || "稍后再试"}
        </p>
        <div className="wx-empty__actions">
          {noCity ? (
            <button type="button" className="wx-button" onClick={onSettings}>
              打开设置
            </button>
          ) : (
            <>
              <button type="button" className="wx-button" onClick={onRefresh}>
                重试
              </button>
              <button type="button" className="wx-button wx-button--ghost" onClick={onSettings}>
                打开设置
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const info = weatherOf(state.code);
  const meta = [
    <>体感温度 <em>{value(state.now.feels, "°")}</em></>,
    <>{info.zh}</>,
    <>湿度 <em>{value(state.now.humidity, "%")}</em></>,
    <>气压 <em>{value(state.now.pressure, " hPa")}</em></>,
  ];
  const meta2 = [
    <>云量 <em>{value(state.now.cloud, "%")}</em></>,
    <>降雨概率 <em>{value(state.now.prob, "%")}</em></>,
    <>紫外线指数 <em>{state.now.uv === null ? "--" : state.now.uv.toFixed(1)}</em></>,
  ];

  return (
    <div className="wx-panel" ref={box} style={style}>
      <button type="button" className="wx-head" onClick={onSettings} title="打开设置">
        <span className="wx-head__title">
          <span className="wx-head__place">
            <span className="wx-head__city">{state.city || state.query || "--"}</span>
            {state.source === "auto" && (
              <span className="wx-head__tag" title="按网络出口判断所在城市，偏到隔壁城市就在设置里改成手动">
                自动定位
              </span>
            )}
          </span>
          <span className="wx-head__temp">
            {state.temp ?? "--"}
            {state.unit}
          </span>
        </span>
        {state.sun && (
          <span className="wx-head__sun">
            <span>
              <Emoji char="🌅" />
              {state.sun.rise}
            </span>
            <span>
              <Emoji char="🌇" />
              {state.sun.set}
            </span>
          </span>
        )}
        <span className="wx-head__meta">
          <span className="wx-meta">
            {meta.map((item, index) => (
              <span key={index}>{item}</span>
            ))}
          </span>
          <span className="wx-meta">
            {meta2.map((item, index) => (
              <span key={index}>{item}</span>
            ))}
          </span>
        </span>
      </button>

      <DayRow days={state.days} />
      <HourChart hours={state.hours} scale={scale} />

      <div className="wx-foot">
        <span className="wx-foot__note">
          {state.ok ? `Open-Meteo · ${clock(state.updatedAt)} 更新` : state.error}
        </span>
        {state.source === "auto" && (
          <button type="button" className="wx-foot__button" onClick={onSettings}>
            定位不准？改手动
          </button>
        )}
        <button type="button" className="wx-foot__button" onClick={onRefresh}>
          刷新
        </button>
      </div>
    </div>
  );
}
