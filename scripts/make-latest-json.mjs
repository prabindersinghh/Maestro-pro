// Build a Tauri-2-shaped latest.json for the auto-updater, from a version number + the path to the
// signed installer's .sig file (produced next to the .exe by `tauri build` when signing env vars
// are set — see docs/UPDATER-SETUP.md). Writes ./latest.json in the current directory.
//
// Usage:
//   node scripts/make-latest-json.mjs <version> <path/to/Kaestral_<version>_x64-setup.exe.sig> [notes]
//
// Example:
//   node scripts/make-latest-json.mjs 1.1.0 src-tauri/target/release/bundle/nsis/Kaestral_1.1.0_x64-setup.exe.sig
//
// Then upload the printed/written latest.json to the GitHub release tagged v<version> on
// prabindersinghh/Kaestral-pro, alongside the installer .exe (NOT the .sig — the signature's
// contents are embedded inside latest.json itself).

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = "prabindersinghh/Kaestral-pro";

function usageError(msg) {
  console.error(`Error: ${msg}\n`);
  console.error("Usage: node scripts/make-latest-json.mjs <version> <path/to/installer.exe.sig> [notes]");
  process.exit(1);
}

const [, , version, sigPath, notes] = process.argv;

if (!version) usageError("missing <version> argument (e.g. 1.1.0)");
if (!/^\d+\.\d+\.\d+$/.test(version)) usageError(`version "${version}" doesn't look like semver (expected e.g. 1.1.0)`);
if (!sigPath) usageError("missing <path/to/installer.exe.sig> argument");

let signature;
try {
  signature = readFileSync(resolve(sigPath), "utf8").trim();
} catch (e) {
  usageError(`couldn't read signature file at "${sigPath}": ${e.message}`);
}
if (!signature) usageError(`signature file at "${sigPath}" is empty`);

const installerName = `Kaestral_${version}_x64-setup.exe`;
const url = `https://github.com/${REPO}/releases/download/v${version}/${installerName}`;

const latest = {
  version,
  notes: notes || `Kaestral ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": { signature, url },
  },
};

const json = JSON.stringify(latest, null, 2) + "\n";
const outPath = resolve("latest.json");
writeFileSync(outPath, json);

console.log(json);
console.log(`Wrote ${outPath}`);
console.log(`Next: upload ${installerName} and latest.json to the GitHub release tagged v${version} on ${REPO}.`);
