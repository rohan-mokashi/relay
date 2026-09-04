import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  parseAlphaObservationLines,
  summarizeAlphaObservations,
} from "../packages/alpha-ops/src/index.js";

const [requestedPath] = process.argv.slice(2).filter((argument) => argument !== "--");
const inputPath = resolve(requestedPath ?? ".data/alpha-observations.jsonl");

try {
  const observations = parseAlphaObservationLines(await readFile(inputPath, "utf8"));
  const summary = summarizeAlphaObservations(observations);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (caught) {
  const message = caught instanceof Error ? caught.message : "Unable to summarize alpha metrics.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
