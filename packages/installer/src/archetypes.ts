/** Coding harnesses a Dunder worker can run in (the app's roster `harness`). */
export const HARNESSES = ["omp", "claude", "codex"] as const;
export type Harness = (typeof HARNESSES)[number];

export const ARCHETYPE_IDS = [
	"generalist",
	"frontend",
	"backend",
	"reviewer",
	"researcher",
	"ops",
	"chief-of-staff",
] as const;
export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];

/**
 * A kind of worker the office can start with. The id doubles as the worker's
 * roster role, which is how the app finds its full brief
 * (`docs/agents/archetypes/<id>.md`; the chief's is `docs/agents/chief-of-staff.md`).
 */
export interface Archetype {
	readonly id: ArchetypeId;
	readonly title: string;
	/** What they own, in one line; the full brief ships with the app. */
	readonly brief: string;
	/** Default worker name. */
	readonly name: string;
	/** Office room (herdr workspace label) they sit in. */
	readonly room: string;
	readonly harness: Harness;
	/** Shown at pick time. The app starts workers on the harness's default model. */
	readonly modelHint: string;
	/** Skills from the engineering toolkit that suit the role. */
	readonly skills: readonly string[];
}

export const ARCHETYPES: readonly Archetype[] = [
	{
		id: "generalist",
		title: "Generalist",
		brief: "Takes any ticket end to end: reads the code, makes the change, proves it works.",
		name: "jim",
		room: "delivery",
		harness: "omp",
		modelHint: "your default omp model",
		skills: ["tdd", "diagnosing-bugs", "codebase-design"],
	},
	{
		id: "frontend",
		title: "Frontend engineer",
		brief: "Owns UI: components, styling, accessibility, and checking the real screen.",
		name: "pam",
		room: "delivery",
		harness: "omp",
		modelHint: "a fast frontier model; UI work is iterative",
		skills: ["prototype", "tdd", "codebase-design"],
	},
	{
		id: "backend",
		title: "Backend engineer",
		brief: "Owns services, data and APIs: schemas, migrations, and failure handling.",
		name: "dwight",
		room: "delivery",
		harness: "omp",
		modelHint: "a strong reasoning model",
		skills: ["tdd", "domain-modeling", "codebase-design", "diagnosing-bugs"],
	},
	{
		id: "reviewer",
		title: "Reviewer",
		brief: "Reviews every change before it lands: correctness, tests, and maintainability.",
		name: "angela",
		room: "delivery",
		harness: "claude",
		modelHint: "a careful reasoning model from a different family than the authors",
		skills: ["code-review", "grilling", "diagnosing-bugs"],
	},
	{
		id: "researcher",
		title: "Researcher",
		brief: "Answers open questions from primary sources and writes up what it found.",
		name: "oscar",
		room: "sales",
		harness: "omp",
		modelHint: "a long-context model with web search",
		skills: ["research", "domain-modeling", "grilling"],
	},
	{
		id: "ops",
		title: "Ops",
		brief: "Keeps builds, releases and machines healthy: CI, deploys, and incidents.",
		name: "darryl",
		room: "delivery",
		harness: "omp",
		modelHint: "a fast, inexpensive model; ops work is many small commands",
		skills: ["diagnosing-bugs", "writing-for-agents"],
	},
	{
		id: "chief-of-staff",
		title: "Chief of staff",
		brief: "Your one point of contact: turns requests into tickets and runs the office.",
		name: "max",
		room: "hq",
		harness: "omp",
		modelHint: "your strongest model; it plans for everyone",
		skills: ["grilling", "writing-for-agents", "research"],
	},
];

/** What a plain Enter (or `--yes`) starts the office with. */
export const DEFAULT_ARCHETYPES: readonly ArchetypeId[] = ["generalist"];

export function archetype(id: ArchetypeId): Archetype {
	const found = ARCHETYPES.find((entry) => entry.id === id);
	if (!found) throw new Error(`unknown archetype ${id}`);
	return found;
}

function isArchetypeId(value: string): value is ArchetypeId {
	return (ARCHETYPE_IDS as readonly string[]).includes(value);
}

export type PickResult =
	| { readonly ok: true; readonly ids: readonly ArchetypeId[] }
	| { readonly ok: false; readonly error: string };

/**
 * Parses a pick list: ids or 1-based numbers, comma or space separated.
 * Blank means the defaults; `none` means nobody. Duplicates collapse.
 */
export function parseArchetypePicks(input: string): PickResult {
	const text = input.trim().toLowerCase();
	if (text === "") return { ok: true, ids: DEFAULT_ARCHETYPES };
	if (text === "none") return { ok: true, ids: [] };
	const ids: ArchetypeId[] = [];
	for (const token of text.split(/[\s,]+/).filter(Boolean)) {
		const byNumber = /^\d+$/.test(token) ? ARCHETYPES[Number(token) - 1]?.id : undefined;
		const id = byNumber ?? (isArchetypeId(token) ? token : undefined);
		if (!id) return { ok: false, error: `unknown archetype "${token}"` };
		if (!ids.includes(id)) ids.push(id);
	}
	return { ok: true, ids };
}
