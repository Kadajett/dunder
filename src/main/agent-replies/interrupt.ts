import type { InterruptResult } from "@shared/agent-replies";
import { createLogger } from "@shared/log/logger";

const log = createLogger("interrupt");

/** First wait for the agent to stop after Escape; a second Escape gets this long again. */
const STOP_WAIT_MS = 10_000;
const RETRY_WAIT_MS = 5_000;

export interface InterruptDeps {
	/** Run a herdr command against the office session; rejects when it fails. */
	readonly cli: (args: readonly string[], timeoutMs?: number) => Promise<unknown>;
	/** The chief of staff's name, who hears about every interrupt (unless he is the one interrupted). */
	readonly chiefName: () => string | undefined;
	/** An office message to an agent (the switchboard delivers it once they are free). */
	readonly tell: (agent: string, text: string) => Promise<void>;
}

/** What the agent is told once it has stopped. */
export function interruptPrompt(reason: string): string {
	const why = reason.trim();
	return `[Jeremy interrupted you]${why ? ` ${why.replace(/[.\s]+$/, "")}.` : ""} Stop and report where you are: what you were doing, and anything left half done.`;
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Escape, then wait (bounded) for a state that takes a prompt; false if it is still busy. */
async function stopTurn(deps: InterruptDeps, name: string, waitMs: number): Promise<boolean> {
	await deps.cli(["agent", "send-keys", name, "esc"]);
	const until = ["--until", "idle", "--until", "done", "--until", "blocked"];
	return deps
		.cli(["agent", "wait", name, ...until, "--timeout", String(waitMs)], waitMs + 5_000)
		.then(
			() => true,
			() => false,
		);
}

/**
 * Stop an agent's turn without firing it: Escape (twice if needed), then a
 * prompt saying why and asking where it got to. Max gets a note, so he isn't
 * bypassed.
 */
export async function interruptAgent(
	deps: InterruptDeps,
	name: string,
	reason: string,
): Promise<InterruptResult> {
	try {
		const stopped =
			(await stopTurn(deps, name, STOP_WAIT_MS)) || (await stopTurn(deps, name, RETRY_WAIT_MS));
		if (!stopped) {
			const seconds = (STOP_WAIT_MS + RETRY_WAIT_MS) / 1000;
			return {
				ok: false,
				reason: `${name} didn't stop within ${seconds} s; open its screen to see why`,
			};
		}
		await deps.cli(["agent", "prompt", name, interruptPrompt(reason)]);
	} catch (error) {
		log.warn("interrupt failed", { name, error });
		return { ok: false, reason: `Couldn't interrupt ${name}: ${reasonOf(error)}`.slice(0, 300) };
	}
	const chief = deps.chiefName();
	if (chief && chief !== name) {
		const why = reason.trim() ? `: ${reason.trim()}` : " (no reason given)";
		await deps
			.tell(chief, `Jeremy interrupted ${name}${why}. It was asked to stop and report where it is.`)
			.catch((error: unknown) => log.warn("Max not told about the interrupt", { name, error }));
	}
	return { ok: true };
}
