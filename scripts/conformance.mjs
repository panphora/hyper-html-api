#!/usr/bin/env node
// Conformance corpus runner: the host-independent specification of the data API.
//
//   node scripts/conformance.mjs generate   rewrite every expectation from this checkout
//   node scripts/conformance.mjs check      regenerate into memory, fail on any diff
//
// The corpus exists because two engines now answer the same question: this one, and the Go
// port in htmlclay. Parity asserted once is a comment; asserted continuously it is a file.
// `check` runs in CI, so a change that moves the contract has to be a reviewed commit to the
// corpus rather than a surprise in someone's JSON.
//
// Three contracts per case, deliberately separate:
//   .parsed.json     what parseRelaxed() made of the rule source
//   .expected.json   what extract() returned          (ok cases)
//   .error.json      type, message and host status    (error cases)
//
// The parse contract is not optional. The seed fixtures feed strict JSON rule trees straight
// to extract(), so they exercise none of parseRelaxed — the largest and quirkiest file in the
// engine. A tokenizer bug that yields a different but still-extracting tree passes every
// extraction comparison ever written.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import adapter from "../src/adapters/cheerio.js";
import { extract, parseRelaxed, findRulesIn } from "../src/engine/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CASES = join(ROOT, "conformance", "cases");
const MANIFEST = join(ROOT, "conformance", "MANIFEST.json");

const mode = process.argv[2];
if (mode !== "generate" && mode !== "check") {
  console.error("usage: conformance.mjs generate|check");
  process.exit(2);
}

// ---------- .meta ----------
// Flat `key: value` lines. Blank lines and # comments ignored.
//   tier:      1 both adapters agree | 2 host-specific | 3 documented divergence
//   face:      query (rules from .rules, as a ?data= value) | tag (rules from the document)
//   token:     face=tag only, the data-rules-name token to look up (default "api")
//   expect:    ok | error
//   skip:      <host>=<reason>, repeatable
//   note:      free text; on tier 3 it must state the direction of the divergence
function parseMeta(text) {
  const meta = { tier: 1, face: "query", expect: "ok", token: "api", skip: [], note: "" };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf(":");
    if (i < 0) throw new Error(`bad meta line: ${line}`);
    const key = t.slice(0, i).trim();
    const value = t.slice(i + 1).trim();
    if (key === "skip") meta.skip.push(value);
    else if (key === "tier") meta.tier = Number(value);
    else meta[key] = value;
  }
  if (!["query", "tag"].includes(meta.face)) throw new Error(`bad face: ${meta.face}`);
  if (!["ok", "error"].includes(meta.expect)) throw new Error(`bad expect: ${meta.expect}`);
  if (![1, 2, 3].includes(meta.tier)) throw new Error(`bad tier: ${meta.tier}`);
  return meta;
}

// ---------- reference host status ----------
// The JS servers classify failures by sniffing the message, not by type, and the two faces
// sniff differently. Recording the status per case is what makes the known 400-vs-500
// divergences pinnable instead of prose: 12 of 16 css-what message classes contain neither
// "JSON" nor "selector", so most malformed selectors are a 500 on every JS host today.
//   query face: hyperclay-local/src/main/utils/data-api.js  extractSiteDataLocal
//   tag face:   hyperclay-local/src/main/utils/data-api.js  mapApiTagError
function referenceStatus(err, face) {
  const name = err && err.name;
  const message = (err && err.message) || "";
  if (face === "tag") {
    if (name === "UnknownRulesVersion" || name === "RulesParseError") return 400;
    return message.includes("selector") ? 400 : 500;
  }
  if (message.includes("JSON")) return 400;
  if (message.includes("selector")) return 400;
  return 500;
}

// ---------- run one case ----------
function runCase(name) {
  const meta = parseMeta(readFileSync(join(CASES, `${name}.meta`), "utf8"));
  const html = readFileSync(join(CASES, `${name}.html`), "utf8");
  const $ = cheerio.load(html);
  const root = $.root();
  const out = { meta, files: {} };

  let rules;
  try {
    if (meta.face === "tag") {
      const found = findRulesIn(adapter, root, meta.token);
      if (!found) {
        // A missing tag is not an engine error: the host turns null into its own 400 body.
        out.files[`${name}.error.json`] = stable({
          type: "NoRulesTag", message: `no script[data-rules-name~="${meta.token}"]`, status: 400,
        });
        return out;
      }
      rules = found.rules;
    } else {
      rules = parseRelaxed(readFileSync(join(CASES, `${name}.rules`), "utf8"));
    }
  } catch (err) {
    out.files[`${name}.error.json`] = stable({
      type: err.name, message: err.message, status: referenceStatus(err, meta.face),
    });
    return out;
  }

  // The parse succeeded, so the parse contract is pinned even when extraction goes on to fail.
  out.files[`${name}.parsed.json`] = stable(rules);

  try {
    out.files[`${name}.expected.json`] = stable(extract(adapter, root, rules));
  } catch (err) {
    out.files[`${name}.error.json`] = stable({
      type: err.name, message: err.message, status: referenceStatus(err, meta.face),
    });
  }
  return out;
}

// Two spaces and a trailing newline, so a diff is readable and git-friendly. The BYTE contract
// the Go port matches lives in the engine's own output, not here — this file is the corpus's
// storage format, and Go compares parsed structures for these.
function stable(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

// ---------- drive ----------
const names = readdirSync(CASES)
  .filter(f => f.endsWith(".meta"))
  .map(f => f.slice(0, -".meta".length))
  .sort();

if (names.length === 0) {
  console.error("conformance: no cases found in " + CASES);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const cheerioPkg = JSON.parse(
  readFileSync(join(ROOT, "node_modules", "cheerio", "package.json"), "utf8"),
);
const manifest = stable({
  engine: pkg.version,
  cheerio: cheerioPkg.version,
  cases: names.length,
  note:
    "Versions the expectations were generated against. Parity means parity with THIS pair; " +
    "regenerate deliberately, never as a side effect of an install.",
});

let failures = 0;
const wanted = new Map([[MANIFEST, manifest]]);

for (const name of names) {
  let result;
  try {
    result = runCase(name);
  } catch (err) {
    console.error(`conformance: case "${name}" could not run: ${err.message}`);
    failures++;
    continue;
  }
  for (const [file, body] of Object.entries(result.files)) wanted.set(join(CASES, file), body);

  // An outcome file that no longer applies has to go, or a case that stops erroring keeps a
  // stale .error.json on disk and check() passes while the contract has silently moved.
  const outcomes = [`${name}.parsed.json`, `${name}.expected.json`, `${name}.error.json`];
  for (const file of outcomes) {
    const path = join(CASES, file);
    if (wanted.has(path) || !existsSync(path)) continue;
    if (mode === "generate") {
      writeFileSync(path, "");
      console.log(`  removed stale ${file}`);
    } else {
      console.error(`conformance: ${file} exists but this checkout does not produce it`);
      failures++;
    }
  }
}

for (const [path, body] of wanted) {
  const rel = path.slice(ROOT.length + 1);
  if (mode === "generate") {
    writeFileSync(path, body);
    continue;
  }
  const actual = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (actual === body) continue;
  failures++;
  console.error(`conformance: ${rel} differs`);
  if (actual === null) console.error("  (missing on disk)");
  else {
    const a = actual.split("\n"), b = body.split("\n");
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        console.error(`  line ${i + 1}:\n    on disk: ${a[i] ?? "(none)"}\n    now:     ${b[i] ?? "(none)"}`);
        break;
      }
    }
  }
}

if (mode === "generate") {
  console.log(`conformance: wrote ${wanted.size} files across ${names.length} cases`);
  process.exit(failures ? 1 : 0);
}
if (failures) {
  console.error(
    `\nconformance: ${failures} difference(s). If this change is intended, run ` +
      `\`npm run conformance:generate\` and commit the corpus alongside the code.`,
  );
  process.exit(1);
}
console.log(`conformance: ${names.length} cases match`);
