/** Pure semver helpers for the release scripts (no ranges, no build metadata). */

export interface SemVer {
	major: number;
	minor: number;
	patch: number;
	/** Dot-separated prerelease identifiers, empty for a release version. */
	prerelease: readonly string[];
}

export const BUMP_KINDS = ["patch", "minor", "major"] as const;
export type BumpKind = (typeof BUMP_KINDS)[number];

const SEMVER =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const NUMERIC = /^\d+$/;

export function isVersion(text: string): boolean {
	return SEMVER.test(text);
}

export function parseVersion(text: string): SemVer {
	const match = SEMVER.exec(text);
	if (match === null) throw new Error(`not a semver version: "${text}"`);
	const [, major = "", minor = "", patch = "", prerelease] = match;
	return {
		major: Number(major),
		minor: Number(minor),
		patch: Number(patch),
		prerelease: prerelease === undefined ? [] : prerelease.split("."),
	};
}

export function formatVersion(version: SemVer): string {
	const core = `${version.major}.${version.minor}.${version.patch}`;
	return version.prerelease.length === 0 ? core : `${core}-${version.prerelease.join(".")}`;
}

function compareIdentifiers(a: string, b: string): number {
	const aNumeric = NUMERIC.test(a);
	const bNumeric = NUMERIC.test(b);
	if (aNumeric && bNumeric) return Math.sign(Number(a) - Number(b));
	if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
	if (a === b) return 0;
	return a < b ? -1 : 1;
}

/** Semver precedence of two prerelease lists; a release (empty list) outranks any prerelease. */
function comparePrerelease(a: readonly string[], b: readonly string[]): number {
	if (a.length === 0 || b.length === 0) return Math.sign(b.length - a.length);
	for (let index = 0; index < Math.min(a.length, b.length); index++) {
		const order = compareIdentifiers(a[index] ?? "", b[index] ?? "");
		if (order !== 0) return order;
	}
	return Math.sign(a.length - b.length);
}

/** -1, 0 or 1 by semver precedence. Throws on invalid versions. */
export function compareVersions(a: string, b: string): number {
	const left = parseVersion(a);
	const right = parseVersion(b);
	const core =
		Math.sign(left.major - right.major) ||
		Math.sign(left.minor - right.minor) ||
		Math.sign(left.patch - right.patch);
	return core !== 0 ? core : comparePrerelease(left.prerelease, right.prerelease);
}

/** npm-style bump: a prerelease becomes its own release when the bumped parts are already set. */
export function bumpVersion(version: string, kind: BumpKind): string {
	const { major, minor, patch, prerelease } = parseVersion(version);
	const release = { major, minor, patch, prerelease: [] };
	const pre = prerelease.length > 0;
	if (kind === "major") {
		if (pre && minor === 0 && patch === 0) return formatVersion(release);
		return formatVersion({ ...release, major: major + 1, minor: 0, patch: 0 });
	}
	if (kind === "minor") {
		if (pre && patch === 0) return formatVersion(release);
		return formatVersion({ ...release, minor: minor + 1, patch: 0 });
	}
	return formatVersion(pre ? release : { ...release, patch: patch + 1 });
}

export function isBumpKind(text: string): text is BumpKind {
	return (BUMP_KINDS as readonly string[]).includes(text);
}

/** The git tag (and GitHub release name) of a version. */
export function tagFor(version: string): string {
	return `v${version}`;
}

/** Highest version among `v<semver>` tags, ignoring anything else. */
export function latestTaggedVersion(tags: readonly string[]): string | undefined {
	let latest: string | undefined;
	for (const tag of tags) {
		const version = tag.startsWith("v") ? tag.slice(1) : "";
		if (!isVersion(version)) continue;
		if (latest === undefined || compareVersions(version, latest) > 0) latest = version;
	}
	return latest;
}
