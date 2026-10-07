import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const stateSchema = z.object({
	version: z.literal(1),
	/** The last build whose card Jeremy dismissed (or the first build ever run). */
	lastSeenBuild: z.string().min(1),
	/** Ratings on the card still open for `built`, so they survive a quit. */
	pending: z
		.object({
			built: z.string().min(1),
			ratings: z.record(z.string(), z.enum(["up", "down"])),
		})
		.nullable(),
});
export type WhatsNewState = z.infer<typeof stateSchema>;

/** The saved state; undefined when there is none yet (or it is unreadable: start over). */
export async function readWhatsNewState(path: string): Promise<WhatsNewState | undefined> {
	try {
		const parsed = stateSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

/** Written atomically, so a quit mid-write never loses the last seen build. */
export async function writeWhatsNewState(path: string, state: WhatsNewState): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(state, null, "\t")}\n`, "utf8");
	await rename(temp, path);
}
