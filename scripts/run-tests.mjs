import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const outdir = ".tmp-tests";
const outfile = `${outdir}/scoring.test.mjs`;

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ["tests/all.test.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["node:test", "node:assert/strict", "jsdom"],
  legalComments: "none"
});

const result = spawnSync(process.execPath, ["--test", outfile], {
  stdio: "inherit"
});

process.exit(result.status ?? 1);
