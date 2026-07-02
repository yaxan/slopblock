import { mkdir, rm, cp } from "node:fs/promises";
import { build } from "esbuild";

const outdir = "dist";
const isDevBuild = process.argv.includes("--dev");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const sharedOptions = {
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: isDevBuild,
  legalComments: "none",
  minify: !isDevBuild
};

await Promise.all([
  build({
    entryPoints: ["src/content/main.ts"],
    outfile: `${outdir}/content.js`,
    ...sharedOptions
  }),
  build({
    entryPoints: ["src/popup/popup.ts"],
    outfile: `${outdir}/popup.js`,
    ...sharedOptions
  }),
  build({
    entryPoints: ["src/options/options.ts"],
    outfile: `${outdir}/options.js`,
    ...sharedOptions
  })
]);

await cp("public", outdir, { recursive: true });
await rm(`${outdir}/icons/slopblock.svg`, { force: true });
