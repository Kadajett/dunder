import { z } from "zod";
import { isVersion } from "./version.mts";

const Manifest = z.looseObject({ name: z.string().optional(), version: z.string() });
export type Manifest = z.infer<typeof Manifest>;

export function parseManifest(text: string, source: string): Manifest {
	const result = Manifest.safeParse(JSON.parse(text));
	if (!result.success) throw new Error(`${source}: ${z.prettifyError(result.error)}`);
	if (!isVersion(result.data.version)) {
		throw new Error(`${source}: "${result.data.version}" is not a semver version`);
	}
	return result.data;
}

/** Top-level `"version"` property line: one tab or two spaces deep, so nested keys never match. */
const TOP_LEVEL_VERSION = /^(\t| {2})"version"(\s*):(\s*)"[^"]*"/m;

/**
 * Sets a package.json `version` by editing that one line, so the file keeps the exact layout
 * Biome formats it with (re-serializing would expand inline arrays).
 */
export function setManifestVersion(text: string, version: string): string {
	if (!isVersion(version)) throw new Error(`not a semver version: "${version}"`);
	if (!TOP_LEVEL_VERSION.test(text)) throw new Error("package.json has no top-level version");
	const next = text.replace(TOP_LEVEL_VERSION, `$1"version"$2:$3"${version}"`);
	if (parseManifest(next, "package.json").version !== version) {
		throw new Error("package.json version edit hit a nested version key");
	}
	return next;
}

const Lockfile = z.looseObject({
	version: z.string().optional(),
	packages: z.record(z.string(), z.looseObject({ version: z.string().optional() })),
});
type Lockfile = z.infer<typeof Lockfile>;

/**
 * Sets the version recorded in package-lock.json for the root and the given workspace paths
 * (`""` is the root). npm writes lockfiles as indented `JSON.stringify` output, so editing the
 * parsed JSON in place (key order intact) and re-serializing with the detected indent is lossless.
 */
export function setLockfileVersion(
	text: string,
	version: string,
	paths: readonly string[],
): string {
	if (!isVersion(version)) throw new Error(`not a semver version: "${version}"`);
	const raw: unknown = JSON.parse(text);
	Lockfile.parse(raw);
	// Zod's output reorders keys; the validated input is edited instead so the diff stays minimal.
	const lockfile = raw as Lockfile;
	lockfile.version = version;
	for (const path of paths) {
		const entry = lockfile.packages[path];
		if (entry?.version !== undefined) entry.version = version;
	}
	const indent = /^\{\n([ \t]+)"/.exec(text)?.[1] ?? "\t";
	return `${JSON.stringify(lockfile, null, indent)}\n`;
}
