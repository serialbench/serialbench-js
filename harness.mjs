// serialbench-js: cross-language benchmark harness, JavaScript (wasm) runtime.
// Measures the canonical fixtures with the tris wasm bindings
// (leptris / yeptris / teptris), writing the shared data-repo schema.
//
// Usage: node harness.mjs <fixtures-dir> <out-results-yaml> [format]
// Formats: xml yaml toml (default: all).

import { performance } from "node:perf_hooks";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import * as leptris from "leptris";
import * as teptris from "teptris";
import { XMLParser as FxpParser } from "fast-xml-parser";
import { parseDocument as Hp2ParseDocument } from "htmlparser2";
import { parse as Yaml22Parse, stringify as Yaml22Stringify } from "yaml";
import { parse as SmolTomlParse, stringify as SmolTomlStringify } from "smol-toml";

// Adapter versions, kept in lockstep with package.json dependencies.
const LEPTRIS_VERSION = "0.1.23";
const TEPTRIS_VERSION = "0.3.11";
const FXP_VERSION = "5.11.2";
const HP2_VERSION = "12.0.0";
const YAML22_VERSION = "2.9.1";
const SMOL_TOML_VERSION = "1.9.1";

const WARMUP = 3;
const ITERS = { small: 10, medium: 3, large: 1 };
const SIZES = ["small", "medium", "large"];

const rows = [];

async function bench(adapter, format, op, size, work) {
  for (let i = 0; i < WARMUP; i++) await work();
  const start = performance.now();
  const iters = ITERS[size];
  for (let i = 0; i < iters; i++) await work();
  const elapsed = (performance.now() - start) / 1000;
  rows.push({
    adapter,
    format,
    size,
    op,
    time_per_iteration: elapsed / iters,
    iterations_per_second: iters / elapsed,
  });
}

function readFixture(dir, size, ext) {
  const p = `${dir}/${size}.${ext}`;
  if (!existsSync(p)) {
    console.error(`missing ${p}`);
    return null;
  }
  return readFileSync(p, "utf8");
}

async function benchJson(ctx, size) {
  const data = readFixture(ctx.dir, size, "json");
  if (data == null) return;
  await ctx.bench("native-json", "json", "parsing", size, async () => {
    JSON.parse(data);
  });
  await ctx.bench("native-json", "json", "generation", size, async () => {
    JSON.stringify(JSON.parse(data));
  });
}

async function benchXml(ctx, size) {
  const data = readFixture(ctx.dir, size, "xml");
  if (data == null) return;
  await ctx.bench("leptris", "xml", "parsing", size, async () => {
    const id = await leptris.load(data);
    await leptris.close(id);
  });
  await ctx.bench("leptris", "xml", "generation", size, async () => {
    const id = await leptris.load(data);
    try {
      await leptris.xml(id);
    } finally {
      await leptris.close(id);
    }
  });
  const fxp = new FxpParser();
  await ctx.bench("fast-xml-parser", "xml", "parsing", size, async () => {
    fxp.parse(data);
  });
  await ctx.bench("leptris", "xml", "xpath", size, async () => {
    const id = await leptris.load(data);
    try {
      for (const q of ["//user | //record", "//user[@id='101']", "//preferences/theme"]) {
        await leptris.xpath(id, q);
      }
    } finally {
      await leptris.close(id);
    }
  });
}

async function benchHtml(ctx, size) {
  const data = readFixture(ctx.dir, size, "html");
  if (data == null) return;
  await ctx.bench("htmlparser2", "html", "parsing", size, async () => {
    Hp2ParseDocument(data);
  });
}

async function benchYaml(ctx, size) {
  // yeptris-wasm 0.1.0 returns silently empty results (load -> {}, dump ->
  // undefined) — yeptris-ts#4. Disabled until the wasm exports are wired;
  // the yaml field is covered by yaml22 meanwhile.
  const data = readFixture(ctx.dir, size, "yaml");
  if (data == null) return;
  await ctx.bench("yaml22", "yaml", "parsing", size, async () => {
    Yaml22Parse(data);
  });
  await ctx.bench("yaml22", "yaml", "generation", size, async () => {
    Yaml22Stringify(Yaml22Parse(data));
  });
}
