import { readFile, rename } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { agentNameSchema, harnessSchema, type Roster } from "@shared/company/roster";
import { findByName, hireAgent, type NewAgent } from "@shared/company/roster-ops";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";

const log = createLogger("workforce:seed");

/**
 * Archetypes with a brief in `docs/agents/archetypes/<role>.md`. A seeded
 * worker's role is its archetype id; the chief of staff's brief stays at
 * `docs/agents/chief-of-staff.md`.
 */
export const ARCHETYPE_ROLES = [
	"generalist",
	"frontend",
	"backend",
	"reviewer",
	"researcher",
	"ops",
	"product-engineer",
	"product-manager",
] as const;

/** One starting worker, as `npx dunder-ai setup` writes them. Extra fields (skills) are ignored. */
const seedAgentSchema = z.object({
	archetype: z.string().min(1).max(64),
	name: agentNameSchema,
	role: z.string().min(1).max(200),
	harness: harnessSchema,
	model: z.string().min(1).max(200).optional(),
	workspaceLabel: z.string().min(1).max(200),
	cwd: z.string().min(1).max(4_096).refine(isAbsolute, "cwd must be absolute").optional(),
});

/** `<userData>/seed.json`: the office's starting staff, applied once to an empty roster. */
export const seedFileSchema = z.object({
	version: z.literal(1),
	agents: z.array(seedAgentSchema).max(32),
});
export type SeedFile = z.infer<typeof seedFileSchema>;

/** The seed's workers as roster hires; workers without a cwd get `defaultCwd`. */
export function seedHires(seed: SeedFile, defaultCwd: string): NewAgent[] {
	return seed.agents.map(({ name, role, harness, model, workspaceLabel, cwd }) => {
		const hire: NewAgent = { name, role, harness, workspaceLabel, cwd: cwd ?? defaultCwd };
		return model === undefined ? hire : { ...hire, model };
	});
}

/** Hires each seeded worker the roster does not already have by name. */
export function seedRoster(
	roster: Roster,
	hires: readonly NewAgent[],
	now: Date,
	newId: () => string,
): Roster {
	let next = roster;
	for (const hire of hires) {
		if (!findByName(next, hire.name)) next = hireAgent(next, hire, now, newId());
	}
	return next;
}

/** Where the supervisor gets the starting staff, and how it marks them hired. */
export interface SeedSource {
	/** The seeded hires; empty when there is no (valid) seed. */
	load(): Promise<readonly NewAgent[]>;
	/** Called once the hires are on the saved roster, so they are never hired twice. */
	applied(): Promise<void>;
}

function isMissingFile(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** `seed.json` in userData; applied → `seed.applied.json`, invalid → `seed.invalid.json`. */
export function fileSeedSource(userData: string, defaultCwd: string): SeedSource {
	const path = join(userData, "seed.json");
	return {
		async load() {
			let text: string;
			try {
				text = await readFile(path, "utf8");
			} catch (error) {
				if (isMissingFile(error)) return [];
				throw error;
			}
			let json: unknown;
			try {
				json = JSON.parse(text);
			} catch {
				json = undefined;
			}
			const parsed = seedFileSchema.safeParse(json);
			if (parsed.success) return seedHires(parsed.data, defaultCwd);
			log.warn("ignoring an invalid seed file", { path, issues: parsed.error.issues });
			await rename(path, join(userData, "seed.invalid.json"));
			return [];
		},
		applied: () => rename(path, join(userData, "seed.applied.json")),
	};
}
