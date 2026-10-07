import { z } from "zod";
import type { ModelOption } from "../models";
import { avatarStyleSchema } from "./avatar-style-schema";
import { type Harness, harnessSchema } from "./roster";

/** Role suggestions in the hire dialog; any free-text role is fine too. */
export const ROLE_PRESETS = [
	"generalist",
	"frontend",
	"backend",
	"reviewer",
	"researcher",
	"ops",
	"product-engineer",
	"product-manager",
	"3d-designer",
] as const;

/** herdr's rule for live agent names, stricter than names adopted into old rosters. */
export const hireNameSchema = z
	.string()
	.regex(
		/^[a-z][a-z0-9_-]{0,31}$/,
		"start with a lowercase letter; then up to 31 lowercase letters, digits, - or _",
	);

export const hireRequestSchema = z.object({
	name: hireNameSchema,
	role: z.string().trim().min(1, "give them a role").max(200),
	harness: harnessSchema,
	/** omp: a catalog selector, optionally `:thinking`. claude/codex: passed through as-is. */
	model: z.string().trim().min(1).max(200).optional(),
	/** The room (herdr workspace label); created when it does not exist yet. */
	workspaceLabel: z.string().trim().min(1, "pick a room").max(64),
	cwd: z
		.string()
		.trim()
		.max(4_096)
		.regex(/^(\/|[a-z]:[\\/])/i, "use an absolute project directory"),
	style: avatarStyleSchema,
});
export type HireRequest = z.input<typeof hireRequestSchema>;
export type ValidHire = z.output<typeof hireRequestSchema>;

export type HireCheck =
	| { readonly ok: true; readonly hire: ValidHire }
	| { readonly ok: false; readonly error: string };

export interface HireContext {
	/** Every name in use: the whole roster (fired workers keep theirs) plus live agents. */
	readonly takenNames: ReadonlySet<string>;
	/** omp's model catalog; omit while it is unknown and the model goes unchecked. */
	readonly catalog?: readonly ModelOption[];
}

/** Whether `model` (`selector` or `selector:thinking`) is something omp can run. */
export function isCatalogModel(model: string, catalog: readonly ModelOption[]): boolean {
	if (catalog.some((option) => option.selector === model)) return true;
	const split = model.lastIndexOf(":");
	if (split === -1) return false;
	const option = catalog.find((entry) => entry.selector === model.slice(0, split));
	return option?.thinking.includes(model.slice(split + 1)) ?? false;
}

/** Validate a hire against the shape rules, names in use and (for omp) the model catalog. */
export function checkHire(input: unknown, context: HireContext): HireCheck {
	const parsed = hireRequestSchema.safeParse(input);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		const field = issue?.path.join(".") || "request";
		return { ok: false, error: `${field}: ${issue?.message ?? "invalid"}` };
	}
	const hire = parsed.data;
	if (context.takenNames.has(hire.name)) {
		return { ok: false, error: `name: ${hire.name} is already taken (names are never reused)` };
	}
	const { model } = hire;
	if (hire.harness === "omp" && model !== undefined && context.catalog) {
		if (!isCatalogModel(model, context.catalog)) {
			return { ok: false, error: `model: omp has no model ${model}` };
		}
	}
	return { ok: true, hire };
}

export type WorkforceResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: string };

/**
 * Whether a new worker on a harness could answer: `ready`; `not-ready` with
 * why and what to run (the hire is refused); `unknown` when the check itself
 * failed (the hire goes ahead).
 */
export type HarnessCheck =
	| { readonly state: "ready" }
	| { readonly state: "not-ready"; readonly reason: string }
	| { readonly state: "unknown"; readonly reason: string };

/** `window.office.workforce`: hire, fire and restart roster workers. */
export interface WorkforceApi {
	/** Defaults for the hire dialog: the project directory new workers start in. */
	defaults(): Promise<{ readonly cwd: string }>;
	/** Whether a worker on this harness could answer right now (CLI there, logged in). */
	checkHarness(harness: Harness): Promise<HarnessCheck>;
	/** Validates, checks the harness, puts the worker on the roster with this look for good, and starts it. */
	hire(request: HireRequest): Promise<WorkforceResult>;
	/** Marks the worker fired (never respawned) and closes its pane. */
	fire(name: string): Promise<WorkforceResult>;
	/** Exits the worker cleanly; the supervisor respawns it resuming its session. */
	restart(name: string): Promise<WorkforceResult>;
}
