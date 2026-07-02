import { rm, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await mkdir("release", { recursive: true });
await rm("release/slopblock.zip", { force: true });

const result = spawnSync("zip", ["-r", "../release/slopblock.zip", "."], {
  cwd: "dist",
  stdio: "inherit"
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
