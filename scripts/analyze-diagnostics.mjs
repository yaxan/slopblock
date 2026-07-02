import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/analyze-diagnostics.mjs <diagnostics.json>");
  process.exit(1);
}

const diagnostics = JSON.parse(readFileSync(path, "utf8"));
const decisions = Array.isArray(diagnostics.decisions) ? diagnostics.decisions : [];

if (!decisions.length) {
  console.log("No decisions found in diagnostics JSON.");
  process.exit(0);
}

const actionCounts = countBy(decisions, (decision) => decision.action ?? "unknown");
const ruleCounts = new Map();
const hidden = [];
const likelyFalsePositiveCandidates = [];

for (const decision of decisions) {
  if (decision.action === "hide") {
    hidden.push(decision);
  }

  const positiveMatches = Array.isArray(decision.matches)
    ? decision.matches.filter((match) => Number(match.weight) > 0)
    : [];

  for (const match of positiveMatches) {
    const key = `${match.ruleId} | ${match.reason}`;
    ruleCounts.set(key, (ruleCounts.get(key) ?? 0) + 1);
  }

  const hasWeakOnlyMatches =
    positiveMatches.length > 0 &&
    positiveMatches.every((match) => match.confidence === "low" || Number(match.weight) <= 30);
  const hasHumanSignals = /\b(?:used|owned|pickup|moving|scratches?|wear|works|estate|garage|condition|smoke[-\s]?free)\b/i.test(
    decision.visibleTextExcerpt ?? ""
  );

  if (decision.action === "hide" && (hasWeakOnlyMatches || hasHumanSignals)) {
    likelyFalsePositiveCandidates.push(decision);
  }
}

printSection("Action Counts", [...actionCounts.entries()].map(([action, count]) => `${action}: ${count}`));
printSection("Top Rules", topEntries(ruleCounts, 20).map(([rule, count]) => `${count} x ${rule}`));
printSection("Hidden Listings", hidden.slice(0, 25).map(formatDecision));
printSection("Likely False-Positive Candidates", likelyFalsePositiveCandidates.slice(0, 25).map(formatDecision));

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function topEntries(map, limit) {
  return [...map.entries()].sort((left, right) => right[1] - left[1]).slice(0, limit);
}

function formatDecision(decision) {
  const matches = Array.isArray(decision.matches)
    ? decision.matches
        .filter((match) => Number(match.weight) > 0)
        .slice(0, 4)
        .map((match) => `${match.ruleId}(${match.weight})`)
        .join(", ")
    : "";
  const id = decision.idHint ? ` #${decision.idHint}` : "";
  return `${decision.action?.toUpperCase() ?? "UNKNOWN"} ${decision.score ?? "?"}${id} ${decision.title ?? "(untitled)"}${
    matches ? ` | ${matches}` : ""
  }`;
}

function printSection(title, lines) {
  console.log(`\n${title}`);
  console.log("=".repeat(title.length));
  if (!lines.length) {
    console.log("None");
    return;
  }

  for (const line of lines) {
    console.log(`- ${line}`);
  }
}
