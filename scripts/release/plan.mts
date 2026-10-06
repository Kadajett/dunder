/**
 * `node scripts/release/plan.ts [--force]`: decides whether the current root version needs a
 * release (no `v<version>` tag on origin yet) and writes `version`, `tag` and `release` outputs.
 */
import { notice, readRootVersion, run, runMain, setOutputs } from "./cli.mts";
import { parseLsRemoteTags, planRelease } from "./release-plan.mts";

runMain(async () => {
	const version = readRootVersion();
	const existingTags = parseLsRemoteTags(await run("git", ["ls-remote", "--tags", "origin"]));
	const plan = planRelease({ version, existingTags, force: process.argv.includes("--force") });
	notice(plan.reason);
	setOutputs({ version: plan.version, tag: plan.tag, release: String(plan.release) });
});
