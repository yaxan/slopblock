import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const outdir = ".tmp-tests";
const outfile = `${outdir}/eval-run.mjs`;

await mkdir(outdir, { recursive: true });
await rm(outfile, { force: true });

await build({
  entryPoints: ["eval/run.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "none"
});

const result = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], {
  stdio: "inherit"
});

process.exit(result.status ?? 1);
