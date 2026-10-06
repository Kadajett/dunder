/**
 * `npm run release:bump -- patch|minor|major|<x.y.z>`: bumps the app (root) and the `dunder-ai`
 * installer to the same version, updates the lockfiles, and commits. Pushing that commit to
 * `main` ships it (see docs/RELEASING.md).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { INSTALLER_DIR, REPO_ROOT, readRootVersion, report, run, runMain } from "./cli.mts";
import { setLockfileVersion, setManifestVersion } from "./manifest.mts";
import { BUMP_KINDS, bumpVersion, compareVersions, isBumpKind, isVersion } from "./version.mts";

/** Lockfile entries that carry the app or installer version (`""` is the root package). */
const LOCK_ENTRIES = ["", "packages/installer"];

function rewrite(path: string, edit: (text: string) => string): string {
	writeFileSync(path, edit(readFileSync(path, "utf8")));
	return relative(REPO_ROOT, path);
}

function nextVersion(current: string, request: string): string {
	const next = isBumpKind(request) ? bumpVersion(current, request) : request;
	if (!isVersion(next)) {
		throw new Error(`usage: npm run release:bump -- ${BUMP_KINDS.join("|")}|<x.y.z>`);
	}
	if (compareVersions(next, current) <= 0) {
		throw new Error(`${next} is not newer than the current version ${current}`);
	}
	return next;
}

runMain(async () => {
	const current = readRootVersion();
	const next = nextVersion(current, process.argv[2] ?? "");
	const lockfiles = [
		join(REPO_ROOT, "package-lock.json"),
		join(INSTALLER_DIR, "package-lock.json"),
	];
	const files = [
		rewrite(join(REPO_ROOT, "package.json"), (text) => setManifestVersion(text, next)),
		rewrite(join(INSTALLER_DIR, "package.json"), (text) => setManifestVersion(text, next)),
		...lockfiles
			.filter((path) => existsSync(path))
			.map((path) => rewrite(path, (text) => setLockfileVersion(text, next, LOCK_ENTRIES))),
	];
	await run("git", ["add", "--", ...files]);
	await run("git", ["commit", "-m", `release: v${next}`, "--", ...files]);
	report(`bumped ${current} -> ${next} and committed ${files.join(", ")}`);
	report(`push to main to release v${next}`);
});
