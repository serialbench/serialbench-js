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

async function benchToml(ctx, size) {
  const data = readFixture(ctx.dir, size, "toml");
  if (data == null) return;
  await ctx.bench("teptris", "toml", "parsing", size, async () => {
    ctx.teptris.loads(data);
  });
  await ctx.bench("teptris", "toml", "generation", size, async () => {
    ctx.teptris.dump(ctx.teptris.loads(data));
  });
  await ctx.bench("smol-toml", "toml", "parsing", size, async () => {
    SmolTomlParse(data);
  });
  await ctx.bench("smol-toml", "toml", "generation", size, async () => {
    SmolTomlStringify(SmolTomlParse(data));
  });
}

function osFamily() {
  switch (process.platform) {
    case "darwin": return "macos";
    case "linux": return "linux";
    case "win32": return "windows";
    default: return process.platform;
  }
}

function arch() {
  return process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x86_64" : process.arch;
}

const runtimeVersion = process.version.replace(/^v/, "");
const platformLabel = process.env.SERIALBENCH_PLATFORM ?? `local-${arch()}`;

async function main() {
  const [, , fixtures, outPath, want] = process.argv;
  if (!fixtures || !outPath) {
    console.error("usage: node harness.mjs <fixtures-dir> <out-yaml> [format]");
    process.exit(2);
  }
  const formats = want ? [want] : ["json", "xml", "html", "yaml", "toml"];

  // leptris exposes init(); yeptris initializes lazily inside load/dump.
  if (typeof leptris.init === "function") await leptris.init();

  // teptris's init() returns the API object; its namespace exports only init.
  const teptrisApi = await teptris.init();
  const ctx = { dir: fixtures, bench, teptris: teptrisApi };

  for (const size of SIZES) {
    if (formats.includes("json")) await benchJson(ctx, size);
    if (formats.includes("xml")) await benchXml(ctx, size);
    if (formats.includes("html")) await benchHtml(ctx, size);
    if (formats.includes("yaml")) await benchYaml(ctx, size);
    if (formats.includes("toml")) await benchToml(ctx, size);
  }

  let out = "";
  out += "platform:\n";
  out += `  platform_string: ${platformLabel}-js-${runtimeVersion}\n`;
  out += "  kind: wasm\n";
  out += `  os: ${osFamily()}\n`;
  out += `  arch: ${arch()}\n`;
  out += "  runtime: js\n";
  out += `  runtime_version: ${runtimeVersion}\n`;
  out += "benchmark_config:\n";
  out += "  name: js-full\n";
  out += "  formats: [json, xml, html, yaml, toml]\n";
  out += "  operations: [parsing, generation, xpath]\n";
  out += "benchmark_result:\n";
  out += "  serializers:\n";
  out += `    - {name: leptris, format: xml, version: '${LEPTRIS_VERSION}', features: {xpath: true, wasm: true}}\n`;
  out += `    - {name: teptris, format: toml, version: '${TEPTRIS_VERSION}', features: {wasm: true}}\n`;
  out += `    - {name: native-json, format: json, version: '${runtimeVersion}', features: {native: true}}\n`;
  out += `    - {name: fast-xml-parser, format: xml, version: '${FXP_VERSION}', features: {}}\n`;
  out += `    - {name: htmlparser2, format: html, version: '${HP2_VERSION}', features: {}}\n`;
  out += `    - {name: yaml22, format: yaml, version: '${YAML22_VERSION}', features: {}}\n`;
  out += `    - {name: smol-toml, format: toml, version: '${SMOL_TOML_VERSION}', features: {}}\n`;
  for (const op of ["parsing", "generation", "xpath"]) {
    out += `  ${op}:\n`;
    for (const row of rows) {
      if (row.op === op) {
        out += `    - {adapter: ${row.adapter}, format: ${row.format}, data_size: ${row.size}, time_per_iteration: ${row.time_per_iteration.toFixed(9)}, iterations_per_second: ${row.iterations_per_second.toFixed(6)}}\n`;
      }
    }
  }
  writeFileSync(outPath, out);
  console.log(`rows: ${rows.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
