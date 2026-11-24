// 生成 build/panel.html：用真实的 PanelView 组件 + 一份假数据渲染几个宽度，
// 版式、字号、间距、横滑逻辑都和插件里一致，只是没有宿主环境。
//
// 用法：npx esbuild tools/preview-entry.tsx --bundle --platform=node --format=esm --jsx=automatic --packages=external --outfile=build/.preview/preview.mjs
//      node build/.preview/preview.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelView } from "../src/panel.tsx";
import { sampleStates } from "./sample.ts";

// 打包后脚本落在 build/.preview，路径按当前工作目录算（总是从项目根跑）。
const root = process.cwd();

const { auto: state, manual, empty, failed } = sampleStates();

const css = readFileSync(join(root, "src/styles.css"), "utf8");

const frames = [
  { label: "775 · 参考图原尺寸（1:1，自动定位）", width: 775, node: <PanelView state={state} width={775} /> },
  { label: "480 · 已到 0.68 缩放下限（七天横滑）", width: 480, node: <PanelView state={state} width={480} /> },
  { label: "360 · 浮屿页面实际宽度（自动定位标记）", width: 360, node: <PanelView state={state} width={360} /> },
  { label: "360 · 手动填城市（无标记）", width: 360, node: <PanelView state={manual} width={360} /> },
  { label: "360 · 空态（定位失败）", width: 360, node: <PanelView state={failed} width={360} /> },
  { label: "360 · 空态（还没填城市）", width: 360, node: <PanelView state={empty} width={360} /> },
];

const frameHtml = frames
  .map(
    (f) => `<section class="frame frame--${f.width}">
      <p class="frame__label">${f.label}</p>
      <div class="surface" style="width:${f.width}px">${renderToStaticMarkup(f.node)}</div>
    </section>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>天气面板 · 真实组件预览</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    padding: 30px 26px 46px;
    background: #0a0a0b;
    color: #d8d8dd;
    font: 12.5px/1.6 "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  h1 { margin: 0 0 4px; font-size: 16px; font-weight: 600; color: #f2f2f2; }
  .note { margin: 0 0 26px; color: #7d7d84; max-width: 60em; }
  .note b { color: #b9b9c0; font-weight: 600; }
  .frames { display: flex; flex-wrap: wrap; gap: 30px; align-items: flex-start; }
  .frame { margin: 0; }
  .frame__label { margin: 0 0 8px; font-size: 11.5px; color: #77777d; letter-spacing: .3px; }
  .surface {
    background: #000;
    border-radius: 26px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, .5);
    overflow: hidden;
  }
${css}
</style>
</head>
<body>
  <h1>天气面板 · 真实组件渲染</h1>
  <p class="note">
    下面是用 <b>src/panel.tsx</b> 直接渲染出来的（假数据），版式、字号、间距、横滑都和插件一致。
    <b>七天</b>放不下时可横滑，<b>逐小时</b>固定 4 列、共 6 屏，用鼠标滚轮或下面的圆点翻页。
  </p>
  <div class="frames">
${frameHtml}
  </div>
</body>
</html>
`;

mkdirSync(join(root, "build"), { recursive: true });
writeFileSync(join(root, "build/panel.html"), html, "utf8");
console.log("wrote build/panel.html", html.length, "bytes");
