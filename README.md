# serialbench-js

The JavaScript (wasm) harness of the cross-language serialbench family.
Measures the canonical fixtures
(https://github.com/serialbench/fixtures) with the tris wasm bindings —
[leptris](https://www.npmjs.com/package/leptris) (XML 1.0, XPath),
[yeptris](https://www.npmjs.com/package/yeptris) (YAML 1.2),
[teptris](https://www.npmjs.com/package/teptris) (TOML 1.1) — writing the
shared data schema (`runs/{date}/{platform}-js-{node}.{format}.yaml`).

## Run

```sh
npm install --no-fund --no-audit
git clone --depth 1 https://github.com/serialbench/fixtures.git fixtures
node harness.mjs fixtures results/xml/results.yaml [format]
```

Formats: `xml yaml toml` (default: all). Operations: parsing, generation,
xpath (xml). Iteration discipline matches the family: warmup 3, then
small:10 / medium:3 / large:1.

The engines are wasm — no native builds, identical behavior on every
platform. `runtime_version` is the Node version; CI pins Node 24 so the
data filename and the site's env key are stable.

## CI

`.github/workflows/benchmark.yml` runs weekly (ubuntu x64/arm,
macos-26, windows-2025): install, clone fixtures, then per-format
checkpoints — benchmark, artifact upload, push to `serialbench/data` via
the Contents API, and a completeness check that fails the leg so
autoheal fills the gaps.
