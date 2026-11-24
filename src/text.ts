function preferZh(): boolean {
  let language = "";
  try {
    language = typeof navigator !== "undefined" && typeof navigator.language === "string" ? navigator.language : "";
    if (!language) language = Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    language = "";
  }
  return language.toLowerCase().startsWith("zh");
}

const zh = {
  title: "天气",
  noCity: "还没设置城市",
  located: "自动定位",
  failed: "天气读取失败",
  rainSoon: "有雨",
  tip: "左键打开设置，右键刷新",
};

const en = {
  title: "Weather",
  noCity: "No city yet",
  located: "Auto-located",
  failed: "Weather unavailable",
  rainSoon: "Rain",
  tip: "Click to open settings, right-click to refresh",
};

export const text = preferZh() ? zh : en;
