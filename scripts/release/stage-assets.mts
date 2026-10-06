/**
 * `node scripts/release/stage-assets.ts [buildDir=release] [outDir=release-assets]`: copies the
 * AppImage and deb of the current version out of electron-builder's output and writes
 * `latest.json` next to them, so the GitHub release uploads exactly `outDir/*`.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { REPO_ROOT, readRootVersion, report, runMain } from "./cli.mts";
import { buildLatestJson, DEFAULT_REPOSITORY, releaseAssetNames } from "./latest-json.mts";

runMain(() => {
	const [buildDir = "release", outDir = "release-assets"] = process.argv.slice(2);
	const source = resolve(REPO_ROOT, buildDir);
	const target = resolve(REPO_ROOT, outDir);
	const version = readRootVersion();
	const repository = process.env["GITHUB_REPOSITORY"] || DEFAULT_REPOSITORY;
	const latest = buildLatestJson({ version, files: readdirSync(source), repository });

	rmSync(target, { recursive: true, force: true });
	mkdirSync(target, { recursive: true });
	for (const name of Object.values(releaseAssetNames(version))) {
		copyFileSync(join(source, name), join(target, name));
	}
	writeFileSync(join(target, "latest.json"), `${JSON.stringify(latest, null, "\t")}\n`);
	report(`staged ${latest.tag} assets in ${target}: ${readdirSync(target).join(", ")}`);
});
