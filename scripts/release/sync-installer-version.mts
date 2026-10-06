/**
 * `node scripts/release/sync-installer-version.ts [--check]`: keeps the `dunder-ai` installer
 * (packages/installer) at the app's version. `--check` fails instead of writing on a mismatch.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INSTALLER_DIR, readRootVersion, report, runMain } from "./cli.mts";
import { parseManifest, setManifestVersion } from "./manifest.mts";

runMain(() => {
	const version = readRootVersion();
	const path = join(INSTALLER_DIR, "package.json");
	const text = readFileSync(path, "utf8");
	const installer = parseManifest(text, path).version;
	if (installer === version) {
		report(`installer version matches the app: ${version}`);
		return;
	}
	if (process.argv.includes("--check")) {
		throw new Error(
			`installer is ${installer} but the app is ${version}; bump with npm run release:bump`,
		);
	}
	writeFileSync(path, setManifestVersion(text, version));
	report(`installer version ${installer} -> ${version}`);
});
