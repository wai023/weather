// 生成 README 顶部图：把面板按 src/panel.tsx 与 src/styles.css 的尺寸逐项画成静态 SVG，
// 再用 resvg 光栅化。数据取自 tools/sample.ts，与 build/panel.html 是同一份。
//
// 图标用 Twemoji（GitHub 自己渲染 emoji 也是这套图），素材先落到 build/.emoji：
//   python tools/fetch-emoji.py
//   node --experimental-strip-types tools/preview-image.mts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { emojiOf, weatherOf, type WeatherState } from "../src/types.ts";
import { sampleStates } from "./sample.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EMOJI_DIR = join(root, "build/.emoji");
const REF_WIDTH = 775;
const MIN_SCALE = 0.68;

const FONTS = ["C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/msyhbd.ttc"].filter((f) => existsSync(f));

const C = {
  text: "#f2f2f2",
  text2: "#8f8f95",
  text3: "#c2c2c9",
  accent: "#1268bd",
  accentText: "#82b6e8",
  line: "#e6b446",
  card: "rgba(255,255,255,0.06)",
  cardHi: "rgba(255,255,255,0.13)",
  border: "rgba(255,255,255,0.08)",
  chart: "rgba(255,255,255,0.04)",
  foot: "#77777d",
  footBtn: "#9c9ca3",
};

// ---------- 基础工具 ----------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c > 0x2e80) w += size;
    else if (ch === " ") w += size * 0.28;
    else if (".,:;!|·-".includes(ch)) w += size * 0.33;
    else if (/[0-9]/.test(ch)) w += size * 0.56;
    else if (/[A-Z]/.test(ch)) w += size * 0.64;
    else if (/[a-z]/.test(ch)) w += size * 0.52;
    else w += size * 0.5;
  }
  return w;
}

type TextOpt = { anchor?: "start" | "middle" | "end"; weight?: number; fill?: string };

function label(x: number, y: number, size: number, fill: string, s: string, opt: TextOpt = {}) {
  return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="Microsoft YaHei" font-size="${size.toFixed(
    2,
  )}" font-weight="${opt.weight ?? 400}" fill="${opt.fill ?? fill}" text-anchor="${
    opt.anchor ?? "start"
  }">${esc(s)}</text>`;
}

function rect(x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string, sw = 1) {
  const s = stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : "";
  return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(
    2,
  )}" rx="${r.toFixed(2)}" fill="${fill}"${s}/>`;
}

// ---------- 图标：Twemoji SVG → PNG data URI（resvg 不出彩色 emoji 字体，只能走图片） ----------

const iconCache = new Map<string, string>();

function codepoints(ch: string): string[] {
  return Array.from(ch)
    .map((c) => (c.codePointAt(0) ?? 0).toString(16))
    .filter((c) => c !== "fe0f");
}

function iconUri(ch: string): string | null {
  const hit = iconCache.get(ch);
  if (hit) return hit;
  const file = codepoints(ch).join("-");
  const svgPath = join(EMOJI_DIR, `${file}.svg`);
  if (!existsSync(svgPath)) return null;
  const pngPath = join(EMOJI_DIR, `${file}.png`);
  if (!existsSync(pngPath)) {
    const png = new Resvg(readFileSync(svgPath, "utf8"), { fitTo: { mode: "width", value: 144 } })
      .render()
      .asPng();
    writeFileSync(pngPath, png);
  }
  const uri = `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`;
  iconCache.set(ch, uri);
  return uri;
}

// 以 (cx, cy) 为中心放一个图标，边长 size
function icon(cx: number, cy: number, size: number, ch: string): string {
  const uri = iconUri(ch);
  if (!uri) throw new Error(`缺图标素材：${ch}（${codepoints(ch).join("-")}.svg），先跑 tools/fetch-emoji.py`);
  return `<image x="${(cx - size / 2).toFixed(2)}" y="${(cy - size / 2).toFixed(2)}" width="${size.toFixed(
    2,
  )}" height="${size.toFixed(2)}" href="${uri}"/>`;
}

// ---------- 面板 ----------

function panel(state: WeatherState, W: number, ox: number, oy: number, id: string): { svg: string; height: number } {
  const u = Math.min(1, Math.max(MIN_SCALE, W / REF_WIDTH));
  const px = (n: number) => n * u;
  const f = (min: number, n: number) => Math.max(min, n * u);

  const padX = Math.min(px(18), W * 0.025);
  const contentX = ox + padX;
  const contentW = W - padX * 2;
  const cx = ox + W / 2;

  const out: string[] = [];
  let y = oy + px(6);

  // 头部：城市 + 自动定位标记 + 温度
  const titleSize = f(20, 30);
  const titleLine = titleSize * 1.15;
  const city = state.city || state.query || "--";
  const tempText = `${state.temp ?? "--"}${state.unit}`;
  const tagSize = f(9.5, 12);
  const tagText = "自动定位";
  const showTag = state.source === "auto";
  const cityW = textWidth(city, titleSize);
  const tagW = textWidth(tagText, tagSize) + px(16) + 2;
  const tagH = tagSize * 1.2 + px(6) + 2;
  const tempW = textWidth(tempText, titleSize);
  const gapPlace = px(18);
  const gapTag = px(9);
  const totalW = cityW + (showTag ? gapTag + tagW : 0) + gapPlace + tempW;
  const startX = cx - totalW / 2;
  const titleBase = y + titleSize * 0.92;

  out.push(label(startX, titleBase, titleSize, C.text, city, { weight: 700 }));
  if (showTag) {
    const chipX = startX + cityW + gapTag;
    const chipY = y + (titleLine - tagH) / 2;
    out.push(
      rect(chipX, chipY, tagW, tagH, px(6), "rgba(18,104,189,0.16)", "rgba(18,104,189,0.5)"),
      label(chipX + tagW / 2, chipY + tagH / 2 + tagSize * 0.36, tagSize, C.accentText, tagText, {
        anchor: "middle",
        weight: 500,
      }),
    );
  }
  out.push(label(startX + totalW, titleBase, titleSize, C.text, tempText, { anchor: "end", weight: 700 }));
  y += titleLine;

  // 日出日落
  if (state.sun) {
    y += px(15);
    const s = f(10.5, 13);
    const lineH = s * 1.2;
    const items = [
      { ch: "🌅", t: state.sun.rise },
      { ch: "🌇", t: state.sun.set },
    ];
    const widths = items.map((i) => s + px(7) + textWidth(i.t, s));
    const total = widths[0]! + px(26) + widths[1]!;
    let x = cx - total / 2;
    for (let i = 0; i < items.length; i += 1) {
      out.push(icon(x + s / 2, y + lineH / 2, s, items[i]!.ch));
      out.push(label(x + s + px(7), y + lineH / 2 + s * 0.36, s, "#e9e9ec", items[i]!.t));
      x += widths[i]! + px(26);
    }
    y += lineH;
  }

  // 两行指标
  y += px(13);
  const metaSize = f(10.5, 13);
  const rowH = metaSize * 1.55;
  const rows: { k: string; v: string }[][] = [
    [
      { k: "体感温度", v: state.now.feels === null ? "--" : `${state.now.feels}°` },
      { k: weatherOf(state.code).zh, v: "" },
      { k: "湿度", v: state.now.humidity === null ? "--" : `${state.now.humidity}%` },
      { k: "气压", v: state.now.pressure === null ? "--" : `${state.now.pressure} hPa` },
    ],
    [
      { k: "云量", v: state.now.cloud === null ? "--" : `${state.now.cloud}%` },
      { k: "降雨概率", v: state.now.prob === null ? "--" : `${state.now.prob}%` },
      { k: "紫外线指数", v: state.now.uv === null ? "--" : state.now.uv.toFixed(1) },
    ],
  ];
  for (const row of rows) {
    const parts = row.map((cell) => ({
      k: cell.k,
      v: cell.v,
      w: textWidth(cell.k, metaSize) + (cell.v ? metaSize * 0.3 + textWidth(cell.v, metaSize) : 0),
    }));
    const sepW = metaSize * 0.34 + metaSize * 1.1;
    const total = parts.reduce((sum, p) => sum + p.w, 0) + sepW * (parts.length - 1);
    let x = cx - total / 2;
    const base = y + metaSize * 1.05;
    for (let i = 0; i < parts.length; i += 1) {
      const p = parts[i]!;
      out.push(label(x, base, metaSize, C.text2, p.k));
      if (p.v) out.push(label(x + textWidth(p.k, metaSize) + metaSize * 0.3, base, metaSize, C.text3, p.v));
      x += p.w;
      if (i < parts.length - 1) {
        out.push(label(x + sepW / 2, base, metaSize, "#4a4a4e", "·", { anchor: "middle" }));
        x += sepW;
      }
    }
    y += rowH;
  }

  // 七日卡片
  y += px(15);
  const cardW = Math.max(64, px(98.5));
  const cardH = Math.max(104, px(148));
  const gap = px(8);
  const rowW = cardW * 7 + gap * 6;
  const daysTop = y;
  let x = contentX + (rowW < contentW ? (contentW - rowW) / 2 : 0);

  out.push(`<g clip-path="url(#days-${id})">`);
  for (const day of state.days) {
    const today = day.label === "今天";
    out.push(
      rect(x, daysTop, cardW, cardH, px(11), today ? C.cardHi : C.card, today ? C.accent : C.border),
    );
    if (today) {
      out.push(
        `<rect x="${(x + 0.5).toFixed(2)}" y="${(daysTop + 0.5).toFixed(2)}" width="${(cardW - 1).toFixed(
          2,
        )}" height="${(cardH - 1).toFixed(2)}" rx="${px(10.5).toFixed(2)}" fill="none" stroke="rgba(18,104,189,0.28)"/>`,
      );
    }
    const labelSize = f(10, 12.5);
    const labelBase = daysTop + px(12) + labelSize * 0.85;
    out.push(label(x + cardW / 2, labelBase, labelSize, today ? C.text : C.text2, day.label, {
      anchor: "middle",
      weight: today ? 500 : 400,
    }));

    const iconSize = f(28, 54);
    const iconTop = labelBase + labelSize * 0.2;
    const iconBottom = daysTop + cardH - px(11) - f(12, 15) * 2.5;
    out.push(icon(x + cardW / 2, (iconTop + iconBottom) / 2, iconSize, emojiOf(day.code, true)));

    const numSize = f(12, 15);
    const loBase = daysTop + cardH - px(11) - numSize * 0.18;
    const hiBase = loBase - numSize * 1.25;
    out.push(label(x + cardW / 2, hiBase, numSize, C.text, `${day.hi}°`, { anchor: "middle", weight: 600 }));
    out.push(label(x + cardW / 2, loBase, numSize, C.text2, `${day.lo}°`, { anchor: "middle" }));
    x += cardW + gap;
  }
  out.push(`</g>`);
  y += cardH;

  // 逐小时：一屏 4 列
  y += px(20);
  const chartTop = y;
  const chartH = Math.max(104, px(153));
  out.push(rect(contentX, chartTop, contentW, chartH, px(13), C.chart, "rgba(255,255,255,0.04)"));
  const colW = contentW / 4;
  const hours = state.hours.slice(0, 4);
  const allTemps = state.hours.map((h) => h.temp);
  const tMax = Math.max(...allTemps);
  const tMin = Math.min(...allTemps);

  for (let i = 0; i < hours.length; i += 1) {
    const hour = hours[i]!;
    const ccx = contentX + (i + 0.5) * colW;
    const tempSize = f(10.5, 13);
    const tempBase = y + px(12) + tempSize * 0.9;
    out.push(label(ccx, tempBase, tempSize, C.text, `${hour.temp}°`, { anchor: "middle" }));

    const iconSize = f(18, 26);
    const iconTop = y + px(12) + tempSize * 1.15 + px(46);
    out.push(icon(ccx, iconTop + iconSize / 2, iconSize, emojiOf(hour.code, hour.isDay)));

    const windSize = f(10, 12.5);
    const windBase = iconTop + iconSize + px(13) + windSize * 0.85;
    out.push(label(ccx, windBase, windSize, C.text2, `${hour.wind} km/h`, { anchor: "middle" }));

    const timeSize = f(10.5, 13);
    const timeBase = windBase + windSize * 0.15 + px(9) + timeSize * 0.9;
    out.push(label(ccx, timeBase, timeSize, C.text, hour.label, { anchor: "middle", weight: 600 }));
  }

  // 折线带：y 34u..54u，把屏外相邻的点也画进来
  const bandTop = y + px(34);
  const bandH = px(20);
  const span = tMax - tMin || 1;
  const pts: { x: number; y: number; inside: boolean }[] = [];
  for (let i = 0; i <= 4; i += 1) {
    const hour = state.hours[i];
    if (!hour) continue;
    pts.push({
      x: contentX + ((i + 0.5) / 4) * contentW,
      y: bandTop + ((tMax - hour.temp) / span) * bandH,
      inside: i < 4,
    });
  }
  out.push(`<g clip-path="url(#chart-${id})">`);
  out.push(
    `<polyline points="${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}" fill="none" stroke="${
      C.line
    }" stroke-width="${(1.6 * u).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  for (const p of pts) {
    if (!p.inside) continue;
    const r = Math.max(4, px(6)) / 2;
    out.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${C.line}"/>`);
  }
  out.push(`</g>`);

  // 翻页点
  y += chartH + px(9);
  const dot = 4;
  const dotGap = px(5);
  const pages = Math.max(1, Math.ceil(state.hours.length / 4));
  const pagerW = pages * dot + (pages - 1) * dotGap;
  let dx = cx - pagerW / 2;
  for (let i = 0; i < pages; i += 1) {
    out.push(`<circle cx="${(dx + dot / 2).toFixed(2)}" cy="${(y + dot / 2).toFixed(2)}" r="${dot / 2}" fill="${
      i === 0 ? C.text3 : "#3a3a3f"
    }"/>`);
    dx += dot + dotGap;
  }
  y += dot;

  // 页脚：从右往左逐段定位，间距由构造保证，不受文字宽度估算误差影响
  y += px(9);
  const footSize = f(9.5, 11.5);
  const fullNote = `Open-Meteo · ${String(new Date(state.updatedAt).getHours()).padStart(2, "0")}:${String(
    new Date(state.updatedAt).getMinutes(),
  ).padStart(2, "0")} 更新`;
  const buttons = state.source === "auto" ? ["定位不准？改手动", "刷新"] : ["刷新"];
  const gapFoot = Math.max(10, footSize * 0.7);
  const btnW = buttons.map((b) => textWidth(b, footSize));

  let note = fullNote;
  let noteW = textWidth(note, footSize);
  const estW = noteW + btnW.reduce((s, w) => s + gapFoot + w, 0);
  let right = cx + estW / 2;
  const footBase = y + footSize * 0.85;

  for (let i = buttons.length - 1; i >= 0; i -= 1) {
    out.push(label(right, footBase, footSize, C.footBtn, buttons[i]!, { anchor: "end" }));
    right -= btnW[i]! + gapFoot;
  }

  // 窄屏放不下时按真实界面的做法给说明文字加省略号
  while (noteW > right - contentX && note.length > 4) {
    note = `${note.slice(0, note.length - 2).trimEnd()}…`;
    noteW = textWidth(note, footSize);
  }
  out.push(label(right, footBase, footSize, C.foot, note, { anchor: "end" }));
  y += footSize * 1.2;

  const height = y + px(2) - oy;
  const svg = `<g>
  <defs>
    <clipPath id="panel-${id}"><rect x="${ox}" y="${oy}" width="${W}" height="${height.toFixed(
      2,
    )}" rx="${px(24).toFixed(2)}"/></clipPath>
    <clipPath id="days-${id}"><rect x="${contentX.toFixed(2)}" y="${daysTop.toFixed(2)}" width="${contentW.toFixed(
      2,
    )}" height="${(cardH + 2).toFixed(2)}"/></clipPath>
    <clipPath id="chart-${id}"><rect x="${contentX.toFixed(2)}" y="${chartTop.toFixed(2)}" width="${contentW.toFixed(
      2,
    )}" height="${(chartH + 1).toFixed(2)}" rx="${px(13).toFixed(2)}"/></clipPath>
  </defs>
  <g clip-path="url(#panel-${id})">
  ${rect(ox, oy, W, height, px(24), "#000")}
  ${out.join("\n  ")}
  </g>
</g>`;
  return { svg, height };
}

// ---------- 拼图 ----------

const { auto } = sampleStates();

const PAD = 36;
const W1 = REF_WIDTH;
const W2 = 360;
const CANVAS_W = W1 + PAD * 2;

const head = 96;
const a = panel(auto, W1, PAD, head, "wide");

const labelY = head + a.height + 46;
const bTop = labelY + 14;
const b = panel(auto, W2, PAD, bTop, "narrow");

const canvasH = Math.max(bTop + b.height, labelY + 210) + PAD;

const notes = [
  "窄屏怎么变",
  "缩放系数 clamp(0.68, 宽 / 775, 1)",
  "字号带下限，最小 9.5px",
  "七天始终 7 列，放不下横滑",
  "逐小时固定 4 列，24 小时 6 屏",
  "折线每屏单独画，跨屏不断头",
];
const noteX = PAD + W2 + 46;
const noteY = bTop + 26;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${canvasH.toFixed(
  0,
)}" viewBox="0 0 ${CANVAS_W} ${canvasH.toFixed(0)}">
<rect width="${CANVAS_W}" height="${canvasH.toFixed(0)}" fill="#0a0a0b"/>
${label(PAD, 42, 17, C.text, "浮屿天气插件 · 天气面板", { weight: 600 })}
${label(PAD, 66, 12, "#85858c", "版式与配色取自 src/panel.tsx 与 src/styles.css，数据是 11 月南通的示意值")}
${a.svg}
${label(PAD, labelY, 11.5, C.foot, `360 宽 · 缩到 0.68：城市名与温度仍在，七天卡片改为横滑`)}
${b.svg}
${notes
  .map((n, i) =>
    i === 0
      ? label(noteX, noteY, 13, C.text, n, { weight: 600 })
      : label(noteX, noteY + 26 + (i - 1) * 24, 12, C.text2, `· ${n}`),
  )
  .join("\n")}
</svg>`;

mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(join(root, "docs/preview.svg"), svg, "utf8");

const png = new Resvg(svg, {
  fitTo: { mode: "width", value: CANVAS_W * 2 },
  font: { fontFiles: FONTS, loadSystemFonts: true, defaultFontFamily: "Microsoft YaHei" },
}).render().asPng();
writeFileSync(join(root, "docs/preview.png"), png);
console.log(
  `wrote docs/preview.svg (${svg.length} chars) and docs/preview.png (${png.length} bytes, ${
    CANVAS_W * 2
  }px wide)`,
);
