import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG, normalizeConfig, weatherOf } from "../src/types.ts";

test("normalizeConfig turns schema strings into numbers", () => {
  const config = normalizeConfig({
    source: "auto",
    city: "  南通 ",
    units: "fahrenheit",
    rainAlert: false,
    rainLookahead: "3",
    rainThreshold: "70",
    refresh: "30",
  });

  assert.deepEqual(config, {
    source: "auto",
    city: "南通",
    units: "fahrenheit",
    rainAlert: false,
    rainLookahead: 3,
    rainThreshold: 70,
    refresh: 30,
  });
});

test("normalizeConfig keeps old installs working", () => {
  // 0.2.x 没有 source：填过城市的继续手动，从来没填过的默认自动定位。
  assert.equal(normalizeConfig({ city: "南通" }).source, "manual");
  assert.equal(normalizeConfig({ city: "  " }).source, "auto");
  assert.equal(normalizeConfig({}).source, "auto");
  assert.equal(normalizeConfig({ source: "manual" }).source, "manual");
  assert.equal(normalizeConfig({ source: "guess" }).source, "auto");
});

test("normalizeConfig falls back on unknown values", () => {
  assert.deepEqual(normalizeConfig(undefined), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);

  const config = normalizeConfig({ units: "kelvin", rainLookahead: "5", rainThreshold: "55", refresh: "7" });
  assert.equal(config.units, "celsius");
  assert.equal(config.rainLookahead, DEFAULT_CONFIG.rainLookahead);
  assert.equal(config.rainThreshold, DEFAULT_CONFIG.rainThreshold);
  assert.equal(config.refresh, DEFAULT_CONFIG.refresh);
  assert.equal(config.rainAlert, DEFAULT_CONFIG.rainAlert);
});

test("weatherOf covers the codes the API actually returns", () => {
  assert.equal(weatherOf(0).kind, "sun");
  assert.equal(weatherOf(2).kind, "cloud");
  assert.equal(weatherOf(3).zh, "阴");
  assert.equal(weatherOf(45).kind, "fog");
  assert.equal(weatherOf(53).zh, "毛毛雨");
  assert.equal(weatherOf(63).kind, "rain");
  assert.equal(weatherOf(73).kind, "snow");
  assert.equal(weatherOf(81).zh, "阵雨");
  assert.equal(weatherOf(95).kind, "thunder");
  assert.equal(weatherOf(null).kind, "sun");
});
