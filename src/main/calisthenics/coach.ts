import type { AgentStatus } from "@shared/herdr/schema";

/** omp's manual compaction slash command; herdr's prompt submits it like typed input. */
export const COMPACT_COMMAND = "/compact";

export const REFLECTION_PROMPT =
	"Calisthenics break: re-read the global memory (`bd prime`/`bd memories` and AGENTS.md), " +
	"recall your todo list (`bd ready` and your in-progress beads). If you learned something " +
	"durable since your last break (a gotcha, a decision, how something really works), save it " +
	'once with `bd remember "<insight>" --key <short-slug>`; never trivia or status. ' +
	"Then reply with one line: what you're doing next.";

export interface CompactionExpectation {
	/** True once the agent's next compaction lands, false when the wait times out or is cancelled. */
	readonly done: Promise<boolean>;
	cancel(): void;
}

export interface CoachDeps {
	/** Current herdr status; undefined once the agent has left the office. */
	statusOf(agent: string): AgentStatus | undefined;
	prompt(agent: string, text: string): Promise<void>;
	/** False when the session has no conversation yet: omp answers "Nothing to compact" and logs nothing. */
	canCompact(agent: string): Promise<boolean>;
	/** Start listening for the agent's next compaction (before asking for one, so none is missed). */
	expectCompaction(agent: string, timeoutMs: number): CompactionExpectation;
	sleep(ms: number): Promise<void>;
	now(): number;
}

export interface CoachLimits {
	readonly pollMs: number;
	/** How long to wait for a working agent to finish its turn. */
	readonly queueMs: number;
	readonly compactMs: number;
}

export const COACH_LIMITS: CoachLimits = {
	pollMs: 1_000,
	queueMs: 30 * 60_000,
	compactMs: 5 * 60_000,
};

export type CoachResult = "prompted" | "blocked" | "gone" | "busy" | "failed";

export interface CoachOutcome {
	readonly result: CoachResult;
	readonly compacted: boolean;
}

/** Wait out a running turn. Blocked agents are skipped: their dialogs belong to the human. */
async function whenFree(
	agent: string,
	deps: CoachDeps,
	limits: CoachLimits,
): Promise<"ready" | "blocked" | "gone" | "busy"> {
	const deadline = deps.now() + limits.queueMs;
	for (;;) {
		const status = deps.statusOf(agent);
		if (status === undefined) return "gone";
		if (status === "blocked") return "blocked";
		if (status !== "working") return "ready";
		if (deps.now() >= deadline) return "busy";
		await deps.sleep(limits.pollMs);
	}
}

/** Ask for a compaction and wait for it to land. Undefined when `/compact` could not be sent. */
async function compact(
	agent: string,
	deps: CoachDeps,
	limits: CoachLimits,
): Promise<boolean | undefined> {
	if (!(await deps.canCompact(agent))) return false;
	const expectation = deps.expectCompaction(agent, limits.compactMs);
	try {
		await deps.prompt(agent, COMPACT_COMMAND);
	} catch (error) {
		expectation.cancel();
		console.warn(`[calisthenics] ${agent}: /compact not sent:`, error);
		return undefined;
	}
	return expectation.done;
}

/**
 * One agent's part of a workout: compact its context, then have it re-read
 * the shared memory and its todo list. Never interrupts a running turn.
 */
export async function coachAgent(
	agent: string,
	deps: CoachDeps,
	limits: CoachLimits = COACH_LIMITS,
): Promise<CoachOutcome> {
	const before = await whenFree(agent, deps, limits);
	if (before !== "ready") return { result: before, compacted: false };
	// A compaction that never shows up (nothing to compact, older omp) still deserves the reminder.
	const compacted = await compact(agent, deps, limits);
	if (compacted === undefined) return { result: "failed", compacted: false };
	const after = await whenFree(agent, deps, limits);
	if (after !== "ready") return { result: after, compacted };
	try {
		await deps.prompt(agent, REFLECTION_PROMPT);
	} catch (error) {
		console.warn(`[calisthenics] ${agent}: reflection prompt not sent:`, error);
		return { result: "failed", compacted };
	}
	return { result: "prompted", compacted };
}
