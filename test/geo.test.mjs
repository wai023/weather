import assert from "node:assert/strict";
import test from "node:test";
import { labelOf, pickPlace, readIpPlace, readReversePlace } from "../src/geo.ts";

test("labelOf drops the province suffix and avoids doubling", () => {
  assert.equal(labelOf("南通", "江苏省"), "南通, 江苏");
  assert.equal(labelOf("北京", "北京市"), "北京");
  assert.equal(labelOf("南通", undefined), "南通");
  assert.equal(labelOf("呼和浩特", "内蒙古自治区"), "呼和浩特, 内蒙古");
});

test("pickPlace keeps a Chinese town when a foreign one has more people", () => {
  const place = pickPlace(
    [
      { name: "南通", latitude: 31.98, longitude: 120.89, country_code: "CN", country: "中国", admin1: "江苏省", population: 5000, feature_code: "PPLA2" },
      { name: "Nantong", latitude: 1.2, longitude: 2.3, country_code: "AU", country: "Australia", population: 120000, feature_code: "PPL" },
    ],
    "南通",
  );
  assert.ok(place);
  assert.equal(place.label, "南通, 江苏");
  assert.equal(place.latitude, 31.98);
});

test("pickPlace prefers the administrative centre among equals", () => {
  const place = pickPlace(
    [
      { name: "南通", latitude: 31.9, longitude: 120.8, country_code: "CN", admin1: "江苏省", population: 800000, feature_code: "PPL" },
      { name: "南通", latitude: 32.1, longitude: 121.1, country_code: "CN", admin1: "江苏省", population: 800000, feature_code: "PPLA2" },
    ],
    "南通",
  );
  assert.ok(place);
  assert.equal(place.latitude, 32.1);
});

test("pickPlace rejects junk", () => {
  assert.equal(pickPlace(undefined, "南通"), null);
  assert.equal(pickPlace([], "南通"), null);
  assert.equal(pickPlace([{ name: "南通" }], "南通"), null);
});

test("readIpPlace reads ipwho.is, ipapi.co and ip-api shapes", () => {
  const who = readIpPlace({
    success: true,
    country: "Hong Kong",
    region: "Hong Kong",
    city: "Hong Kong",
    latitude: 22.2783185,
    longitude: 114.174686,
  });
  assert.ok(who);
  assert.equal(who.label, "Hong Kong");
  assert.equal(who.latitude, 22.2783185);

  const co = readIpPlace({ city: "Nantong", region: "Jiangsu", country_name: "China", latitude: 31.98, longitude: 120.89 });
  assert.ok(co);
  assert.equal(co.label, "Nantong, Jiangsu");

  const api = readIpPlace({ status: "success", country: "香港", regionName: "葵青區", city: "葵涌", lat: 22.374, lon: 114.1369 });
  assert.ok(api);
  assert.equal(api.label, "葵涌, 葵青區");
  assert.equal(api.longitude, 114.1369);
});

test("readIpPlace rejects failures instead of putting us in the gulf", () => {
  assert.equal(readIpPlace(undefined), null);
  assert.equal(readIpPlace({ success: false, message: "reserved range" }), null);
  assert.equal(readIpPlace({ status: "fail", message: "private range" }), null);
  assert.equal(readIpPlace({ latitude: 0, longitude: 0 }), null);
  assert.equal(readIpPlace({ latitude: "x", longitude: 1 }), null);
  assert.equal(readIpPlace({ latitude: 200, longitude: 1 }), null);
});

test("readReversePlace turns coordinates into a Chinese name", () => {
  const nantong = readReversePlace(
    { city: "南通市", principalSubdivision: "江苏省", countryName: "中华人民共和国" },
    31.98,
    120.89,
  );
  assert.ok(nantong);
  assert.equal(nantong.label, "南通, 江苏");

  const shanghai = readReversePlace({ city: "上海市", principalSubdivision: "上海市" }, 31.23, 121.47);
  assert.ok(shanghai);
  assert.equal(shanghai.label, "上海");

  // city 空时退到 locality，再空就认为反查失败
  assert.equal(readReversePlace({ locality: "維多利亞城" }, 22.27, 114.17)?.label, "維多利亞城");
  assert.equal(readReversePlace({ countryName: "中国" }, 31.98, 120.89), null);
  assert.equal(readReversePlace(null, 31.98, 120.89), null);
});
