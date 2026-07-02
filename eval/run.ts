import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { scoreListing } from "../src/common/scoring";
import { DEFAULT_SETTINGS } from "../src/common/settings";
import { runFloodScenarios } from "./scenarios";
import type { Aggressiveness, FilterAction, ListingSnapshot, RuleMatch } from "../src/common/types";
import type { CorpusEntry } from "./types";

type View = "card" | "detail";

type EntryResult = {
  entry: CorpusEntry;
  view: View;
  action: FilterAction;
  score: number;
  matches: RuleMatch[];
};

const LEVELS: Aggressiveness[] = ["relaxed", "balanced", "strict"];
const CORPUS_DIR = join(process.cwd(), "eval", "corpus");
const verbose = process.argv.includes("--verbose");
const gate = process.argv.includes("--gate");
const onlyLevelArg = process.argv.find((arg) => arg.startsWith("--level="));
const onlyLevels = onlyLevelArg ? [onlyLevelArg.split("=")[1] as Aggressiveness] : LEVELS;

function loadCorpus(): CorpusEntry[] {
  const files = readdirSync(CORPUS_DIR).filter((file) => file.endsWith(".json"));
  const entries: CorpusEntry[] = [];
  const seenIds = new Set<string>();

  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(CORPUS_DIR, file), "utf8")) as CorpusEntry[];
    for (const entry of parsed) {
      if (!entry.id || !entry.title || !entry.label) {
        throw new Error(`Corpus entry missing id/title/label in ${file}: ${JSON.stringify(entry).slice(0, 120)}`);
      }
      if (seenIds.has(entry.id)) {
        throw new Error(`Duplicate corpus id ${entry.id} in ${file}`);
      }
      seenIds.add(entry.id);
      entries.push(entry);
    }
  }

  return entries;
}

function snapshotFor(entry: CorpusEntry, view: View): ListingSnapshot {
  const lines = [entry.price ?? "", entry.title, entry.location ?? ""].filter(Boolean);
  if (view === "detail" && entry.body) {
    lines.push(...entry.body.split(/\r?\n/).filter(Boolean));
  }

  return {
    idHint: `eval-${entry.id}`,
    title: entry.title,
    priceText: entry.price ?? "",
    locationText: entry.location ?? "",
    visibleText: lines.join("\n"),
    textLines: lines
  };
}

function evaluate(entries: CorpusEntry[], level: Aggressiveness, view: View): EntryResult[] {
  const settings = { ...DEFAULT_SETTINGS, aggressiveness: level };
  return entries.map((entry) => {
    const result = scoreListing(snapshotFor(entry, view), settings, {});
    return { entry, view, action: result.action, score: result.score, matches: result.matches };
  });
}

function count(results: EntryResult[], label: CorpusEntry["label"], action: FilterAction): number {
  return results.filter((result) => result.entry.label === label && result.action === action).length;
}

type RuleNoise = { ruleId: string; legit: number; slop: number; borderline: number };

function ruleNoiseTable(results: EntryResult[]): RuleNoise[] {
  const table = new Map<string, RuleNoise>();
  for (const result of results) {
    for (const match of result.matches) {
      if (match.weight <= 0) {
        continue;
      }
      const row = table.get(match.ruleId) ?? { ruleId: match.ruleId, legit: 0, slop: 0, borderline: 0 };
      row[result.entry.label] += 1;
      table.set(match.ruleId, row);
    }
  }
  return Array.from(table.values()).sort((a, b) => b.legit - a.legit || b.slop - a.slop);
}

function pct(part: number, whole: number): string {
  return whole === 0 ? "n/a" : `${((100 * part) / whole).toFixed(1)}%`;
}

function main(): void {
  const entries = loadCorpus();
  const legitTotal = entries.filter((entry) => entry.label === "legit").length;
  const slopTotal = entries.filter((entry) => entry.label === "slop").length;
  const borderlineTotal = entries.length - legitTotal - slopTotal;

  console.log(`Corpus: ${entries.length} entries (${legitTotal} legit, ${slopTotal} slop, ${borderlineTotal} borderline)\n`);

  let hardFailures = 0;

  for (const level of onlyLevels) {
    for (const view of ["card", "detail"] as View[]) {
      const results = evaluate(entries, level, view);
      const fpHide = count(results, "legit", "hide");
      const fpDim = count(results, "legit", "dim");
      const fpLabel = count(results, "legit", "label");
      const tpHide = count(results, "slop", "hide");
      const tpDim = count(results, "slop", "dim");
      const tpLabel = count(results, "slop", "label");
      const missed = count(results, "slop", "allow");

      console.log(`== ${level} / ${view} view ==`);
      console.log(
        `  legit FP:  hidden ${fpHide} (${pct(fpHide, legitTotal)}), dimmed ${fpDim} (${pct(fpDim, legitTotal)}), labeled ${fpLabel} (${pct(fpLabel, legitTotal)})`
      );
      console.log(
        `  slop:      hidden ${tpHide}, dimmed ${tpDim}, labeled ${tpLabel}, MISSED ${missed} (${pct(missed, slopTotal)} miss)`
      );

      if (level === "balanced") {
        hardFailures += fpHide + fpDim;
      }

      const failures = results.filter(
        (result) =>
          (result.entry.label === "legit" && result.action !== "allow") ||
          (result.entry.label === "slop" && result.view === "detail" && result.action === "allow")
      );

      if (verbose && failures.length) {
        for (const failure of failures) {
          const kindTag = failure.entry.label === "legit" ? "FP" : "MISS";
          const rules = failure.matches
            .filter((match) => match.weight > 0)
            .map((match) => `${match.ruleId}(${match.weight}${match.sample ? ` "${match.sample}"` : ""})`)
            .join(", ");
          console.log(
            `    [${kindTag}] ${failure.entry.id} (${failure.entry.kind}) -> ${failure.action} score ${failure.score}`
          );
          console.log(`         "${failure.entry.title}" ${failure.entry.price ?? ""}`);
          if (rules) {
            console.log(`         rules: ${rules}`);
          }
        }
      }
      console.log("");
    }
  }

  console.log("== Rule noise (balanced / detail view; rules firing on legit entries are suspects) ==");
  const noise = ruleNoiseTable(evaluate(entries, "balanced", "detail"));
  for (const row of noise) {
    const marker = row.legit > 0 ? "  <-- fires on legit" : "";
    console.log(`  ${row.ruleId.padEnd(34)} legit ${String(row.legit).padStart(3)} | slop ${String(row.slop).padStart(3)}${marker}`);
  }

  console.log("");
  const floodFailures = runFloodScenarios(verbose);
  hardFailures += floodFailures;

  if (gate && hardFailures > 0) {
    console.error(`\nEVAL GATE FAILED: ${hardFailures} hard failure(s) (legit dimmed/hidden at balanced, or flood scenario failed).`);
    process.exit(1);
  }
}

main();
