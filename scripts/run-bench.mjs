import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const outdir = ".tmp-tests";
const outfile = `${outdir}/bench.mjs`;

await mkdir(outdir, { recursive: true });
await rm(outfile, { force: true });

await build({
  entryPoints: ["eval/bench.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["jsdom"],
  legalComments: "none"
});

const result = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
