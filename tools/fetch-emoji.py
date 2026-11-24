"""取 Twemoji 的天气图标，供 tools/preview-image.mts 拼图用。

图标不要进版本库，README 只放生成好的 docs/preview.png。需要重画时：

    python tools/fetch-emoji.py
    node --experimental-strip-types tools/preview-image.mts

走 api.github.com 是为了在受限网络里也能取到（raw.githubusercontent.com 常被挡）。
"""
import os
import time
import urllib.error
import urllib.request

CODES = [
    "2600",  # ☀️
    "1f324",  # 🌤️
    "26c5",  # ⛅️
    "2601",  # ☁️
    "1f327",  # 🌧️
    "1f326",  # 🌦️
    "1f319",  # 🌙
    "1f32b",  # 🌫️
    "26c8",  # ⛈️
    "1f305",  # 🌅
    "1f307",  # 🌇
]

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "build", ".emoji")
URL = "https://api.github.com/repos/jdecked/twemoji/contents/assets/svg/{}.svg"


def main():
    os.makedirs(OUT, exist_ok=True)
    missing = 0
    for code in CODES:
        path = os.path.join(OUT, code + ".svg")
        if os.path.exists(path) and os.path.getsize(path) > 200:
            print("cached", code)
            continue
        req = urllib.request.Request(URL.format(code), headers={"Accept": "application/vnd.github.raw"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=45) as resp:
                    data = resp.read()
                with open(path, "wb") as fh:
                    fh.write(data)
                print("got", code, len(data), "bytes")
                break
            except urllib.error.HTTPError as err:
                print("fail", code, err.code)
                missing += 1
                break
            except Exception as err:  # 网络抖动，重试
                if attempt == 2:
                    print("err", code, type(err).__name__)
                    missing += 1
                else:
                    time.sleep(2)
    if missing:
        raise SystemExit(f"{missing} 个图标没取到")


if __name__ == "__main__":
    main()
