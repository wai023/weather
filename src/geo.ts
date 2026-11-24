export type Place = {
  latitude: number;
  longitude: number;
  // 显示用：「南通, 江苏」
  label: string;
  country: string;
  // 只有地名检索能给出人口，网络定位没有
  population?: number;
};

type Row = {
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  country?: unknown;
  country_code?: unknown;
  admin1?: unknown;
  population?: unknown;
  feature_code?: unknown;
};

// 「江苏省」→「江苏」，「北京市」→「北京」，与地名重复时就不再重复一遍。
// 反向地理编码给的常是「南通市」，去掉行政后缀读着才顺。
function shortPlace(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 2) return trimmed;
  return trimmed.replace(/(特别行政区|自治州|地区|市)$/u, "");
}

export function labelOf(name: string, admin1?: unknown): string {
  const city = shortPlace(name);
  const province =
    typeof admin1 === "string"
      ? admin1
          .replace(/(维吾尔|回族|壮族|特别行政区|自治区|省|市)$/u, "")
          .trim()
      : "";
  if (!province || province === city) return city;
  return `${city}, ${province}`;
}

// 同名地点很多（南通市 / 南通镇），优先国内、优先人口多、优先行政中心，
// 否则「南通」会被解析到别的国家的村镇上。
export function pickPlace(results: unknown, query: string): Place | null {
  if (!Array.isArray(results)) return null;
  const rows = results.filter((r): r is Row => !!r && typeof r === "object");
  if (!rows.length) return null;

  const want = query.trim().toLowerCase();
  let best: { score: number; place: Place } | null = null;

  for (const row of rows) {
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    const name = typeof row.name === "string" ? row.name : "";
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const countryCode = typeof row.country_code === "string" ? row.country_code : "";
    const population = Number(row.population) || 0;
    const feature = typeof row.feature_code === "string" ? row.feature_code : "";

    let score = 0;
    if (countryCode.toUpperCase() === "CN") score += 40;
    if (name.toLowerCase() === want) score += 8;
    if (feature.startsWith("PPLA")) score += 6;
    score += Math.min(20, Math.log10(population + 1) * 4);

    if (!best || score > best.score) {
      best = {
        score,
        place: {
          latitude: lat,
          longitude: lon,
          label: labelOf(name, row.admin1),
          country: typeof row.country === "string" ? row.country : "",
          population,
        },
      };
    }
  }

  return best?.place ?? null;
}

function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

// IP 定位接口各有各的字段名，这里统一成 Place：
// ipwho.is 用 latitude/longitude/city/region，ipapi.co 用 country_name，
// ip-api.com 用 lat/lon/regionName。失败时 success=false 或 status!=="success"。
export function readIpPlace(data: unknown): Place | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.success === false || row.bogon === true) return null;
  if (typeof row.status === "string" && row.status !== "success") return null;

  const latitude = Number(row.latitude ?? row.lat);
  const longitude = Number(row.longitude ?? row.lon ?? row.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // 0,0 是各家的「没定到」占位，落在这里一般是几内亚湾。
  if (latitude === 0 && longitude === 0) return null;

  const city = text(row.city, row.town, row.locality, row.district);
  const region = text(row.region, row.regionName, row.province, row.principalSubdivision);
  const country = text(row.country, row.country_name, row.countryName);

  return {
    latitude,
    longitude,
    label: city ? labelOf(city, region) : region || country,
    country,
  };
}

// 反向地理编码只用来把坐标翻成中文地名（ipwho.is 这类接口只给英文）。
export function readReversePlace(data: unknown, latitude: number, longitude: number): Place | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;

  // 只认城市级及以上；只剩国家名就不算查到，否则会把「中国」当成城市显示。
  const city = text(row.city, row.locality, row.principalSubdivision);
  if (!city) return null;

  return {
    latitude,
    longitude,
    label: labelOf(city, row.principalSubdivision),
    country: text(row.countryName, row.country),
  };
}
