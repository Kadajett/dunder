import { compareVersions, latestTaggedVersion, tagFor } from "./version.mts";

/** Tag names from `git ls-remote --tags <remote>` output (peeled `^{}` entries folded in). */
export function parseLsRemoteTags(output: string): string[] {
	const tags = new Set<string>();
	for (const line of output.split("\n")) {
		const ref = line.split("\t")[1]?.trim();
		if (ref === undefined || !ref.startsWith("refs/tags/")) continue;
		tags.add(ref.slice("refs/tags/".length).replace(/\^\{\}$/, ""));
	}
	return [...tags];
}

export interface ReleasePlan {
	version: string;
	tag: string;
	/** Whether the workflow builds and publishes. */
	release: boolean;
	/** One line for the workflow log explaining the decision. */
	reason: string;
}

export interface ReleasePlanInput {
	version: string;
	existingTags: readonly string[];
	/** Manual re-run (`workflow_dispatch`): rebuild and re-publish the current version. */
	force: boolean;
}

/**
 * Release when `v<version>` is not tagged yet (or on a forced re-run of the current version).
 * A version older than the newest tagged release is an error: it would never become "latest".
 */
export function planRelease({ version, existingTags, force }: ReleasePlanInput): ReleasePlan {
	const tag = tagFor(version);
	const tagged = existingTags.includes(tag);
	if (tagged) {
		return force
			? { version, tag, release: true, reason: `${tag} exists; forced re-run re-publishes it` }
			: { version, tag, release: false, reason: `${tag} is already released; nothing to do` };
	}
	const latest = latestTaggedVersion(existingTags);
	if (latest !== undefined && compareVersions(version, latest) < 0) {
		throw new Error(`version ${version} is older than the latest release v${latest}; bump it`);
	}
	return { version, tag, release: true, reason: `${tag} is new; releasing` };
}
