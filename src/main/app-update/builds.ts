import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

/**
 * The builds on disk in the app checkout: `out/` runs, `out-next/` is a
 * build in progress, `out-prev/` is the build the last update replaced, kept
 * one level deep so Jeremy can roll back to it.
 */
export const STAGING_DIR = "out-next";
const LIVE_DIR = "out";
const PREVIOUS_DIR = "out-prev";
/** Where a broken build waits while the kept one moves back in. */
const RETIRED_DIR = "out-bad";
/** Inside `out-prev/`: which commit that build was made from. */
const MANIFEST = "kept-build.json";

const manifestSchema = z.object({
	commit: z.string().regex(/^[0-9a-f]{7,64}$/),
	keptAt: z.string(),
});
export type KeptBuild = z.infer<typeof manifestSchema>;

const ignoreMissing = (error: NodeJS.ErrnoException): void => {
	if (error.code !== "ENOENT") throw error;
};

/**
 * Swap the staged build into `out/`, putting the old one back if the swap
 * fails. The replaced build stays in `out-prev/`, labelled with `outgoing`
 * (the running build's commit); without a commit it can't be named, so it goes.
 */
export async function promote(
	root: string,
	outgoing: string | undefined,
	now = new Date(),
): Promise<void> {
	const out = join(root, LIVE_DIR);
	const previous = join(root, PREVIOUS_DIR);
	await rm(previous, { recursive: true, force: true });
	const hadOut = await rename(out, previous).then(
		() => true,
		(error: NodeJS.ErrnoException) => {
			ignoreMissing(error);
			return false;
		},
	);
	try {
		await rename(join(root, STAGING_DIR), out);
	} catch (error) {
		if (hadOut) await rename(previous, out);
		throw error;
	}
	if (!hadOut) return;
	if (!outgoing) {
		await rm(previous, { recursive: true, force: true });
		return;
	}
	const manifest: KeptBuild = { commit: outgoing, keptAt: now.toISOString() };
	await writeFile(join(previous, MANIFEST), JSON.stringify(manifest));
}

/** The kept previous build, or null when there is none (or it can't be named). */
export async function keptBuild(root: string): Promise<KeptBuild | null> {
	const text = await readFile(join(root, PREVIOUS_DIR, MANIFEST), "utf8").catch(
		(error: NodeJS.ErrnoException) => {
			ignoreMissing(error);
			return null;
		},
	);
	if (text === null) return null;
	const parsed = manifestSchema.safeParse(JSON.parse(text));
	return parsed.success ? parsed.data : null;
}

/**
 * Put the kept build back as `out/` and drop the one it replaces (rollback
 * is one level deep). If the swap fails half-way, the running build goes back.
 */
export async function restoreKept(root: string): Promise<void> {
	const out = join(root, LIVE_DIR);
	const retired = join(root, RETIRED_DIR);
	await rm(retired, { recursive: true, force: true });
	await rename(out, retired);
	try {
		await rename(join(root, PREVIOUS_DIR), out);
	} catch (error) {
		await rename(retired, out);
		throw error;
	}
	await rm(join(out, MANIFEST), { force: true });
	await rm(retired, { recursive: true, force: true });
}
