import { z } from "zod";
import { avatarStyleSchema } from "./avatar-style-schema";

export const ROSTER_VERSION = 1;

/** The coding harness a worker runs in. Only omp is supervised today. */
export const harnessSchema = z.literal("omp");
export type Harness = z.infer<typeof harnessSchema>;

/**
 * herdr agent name; also the seed the avatar style was snapshotted from.
 * Plain word characters only: it names files and appears in shell commands.
 */
export const agentNameSchema = z
	.string()
	.max(64)
	.regex(/^[a-z0-9][a-z0-9_-]*$/i);

/**
 * One hired worker. `id`, `name`, `style` and `createdAt` are its identity:
 * fixed at creation and never regenerated or edited afterwards.
 */
export const rosterAgentSchema = z.object({
	id: z.string().min(1).max(64),
	name: agentNameSchema,
	style: avatarStyleSchema,
	role: z.string().max(200),
	harness: harnessSchema,
	model: z.string().min(1).max(200).exactOptional(),
	/** herdr workspace (office room) the worker sits in, matched by label. */
	workspaceLabel: z.string().min(1).max(200),
	cwd: z.string().min(1).max(4_096),
	/** omp session file the worker resumes on respawn, as last reported by herdr. */
	lastSessionPath: z.string().min(1).max(4_096).exactOptional(),
	createdAt: z.iso.datetime(),
	/** Set when the user lets the worker go; fired workers are never respawned. */
	firedAt: z.iso.datetime().exactOptional(),
});
export type RosterAgent = z.infer<typeof rosterAgentSchema>;

export const rosterSchema = z
	.object({
		version: z.literal(ROSTER_VERSION),
		agents: z.array(rosterAgentSchema),
	})
	.superRefine((roster, ctx) => {
		const seen = new Set<string>();
		for (const agent of roster.agents) {
			for (const key of [`id:${agent.id}`, `name:${agent.name}`]) {
				if (seen.has(key)) ctx.addIssue({ code: "custom", message: `duplicate roster ${key}` });
				seen.add(key);
			}
		}
	});
export type Roster = z.infer<typeof rosterSchema>;

/** Read-only roster access exposed to the renderer as `window.office.roster`. */
export interface RosterApi {
	get(): Promise<Roster | null>;
	onChange(listener: (roster: Roster) => void): () => void;
}
