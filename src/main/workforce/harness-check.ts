import { execFile } from "node:child_process";
import type { Harness } from "@shared/company/roster";
import type { HarnessCheck } from "@shared/company/workforce";
import { z } from "zod";

/** Upper bound on one login check: it must never hold up the hire dialog. */
export const CHECK_TIMEOUT_MS = 5_000;

/** How a check command ended. */
export interface CommandResult {
	/** Exit code; null when it was killed (timeout) or never ran. */
	readonly code: number | null;
	readonly output: string;
	/** The executable isn't on PATH. */
	readonly missing: boolean;
}

export type CommandRunner = (command: string, args: readonly string[]) => Promise<CommandResult>;

/** Run a check command with the timeout; never rejects. */
export function runCommand(command: string, args: readonly string[]): Promise<CommandResult> {
	const done = Promise.withResolvers<CommandResult>();
	execFile(command, [...args], { timeout: CHECK_TIMEOUT_MS }, (error, stdout, stderr) => {
		const output = `${stdout}\n${stderr}`;
		if (!error) {
			done.resolve({ code: 0, output, missing: false });
			return;
		}
		const code = typeof error.code === "number" ? error.code : null;
		done.resolve({ code, output, missing: error.code === "ENOENT" });
	});
	return done.promise;
}

const notInstalled = (cli: string): HarnessCheck => ({
	state: "not-ready",
	reason: `${cli} isn't installed here (no ${cli} on PATH)`,
});
const couldNotCheck = (cli: string): HarnessCheck => ({
	state: "unknown",
	reason: `couldn't check ${cli}'s login`,
});

/** `codex login status`: 'Logged in using …' or 'Not logged in'. */
export function codexCheck(result: CommandResult): HarnessCheck {
	if (result.missing) return notInstalled("codex");
	if (/\bnot logged in\b/i.test(result.output)) {
		return {
			state: "not-ready",
			reason: "codex isn't logged in: run `codex login` in a terminal, then hire",
		};
	}
	if (result.code === 0 && /\blogged in\b/i.test(result.output)) return { state: "ready" };
	return couldNotCheck("codex");
}

const claudeStatusSchema = z.looseObject({ loggedIn: z.boolean() });

/** `claude auth status`: JSON with `loggedIn`. */
export function claudeCheck(result: CommandResult): HarnessCheck {
	if (result.missing) return notInstalled("claude");
	const start = result.output.indexOf("{");
	const end = result.output.lastIndexOf("}");
	if (start === -1 || end < start) return couldNotCheck("claude");
	try {
		const status = claudeStatusSchema.safeParse(JSON.parse(result.output.slice(start, end + 1)));
		if (!status.success) return couldNotCheck("claude");
		if (status.data.loggedIn) return { state: "ready" };
		return {
			state: "not-ready",
			reason: "claude isn't logged in: run `claude auth login` in a terminal, then hire",
		};
	} catch {
		return couldNotCheck("claude");
	}
}

/**
 * Can a new worker on `harness` answer? codex and claude: their CLI is there
 * and logged in. omp: its catalog lists at least one model (omp lists only
 * providers it has credentials for); the chosen model itself is checked by
 * `checkHire`.
 */
export async function checkHarness(
	harness: Harness,
	deps: { readonly run?: CommandRunner; readonly ompModels: () => Promise<number> },
): Promise<HarnessCheck> {
	const run = deps.run ?? runCommand;
	if (harness === "codex") return codexCheck(await run("codex", ["login", "status"]));
	if (harness === "claude") return claudeCheck(await run("claude", ["auth", "status"]));
	const models = await deps.ompModels().catch(() => null);
	if (models === null) return couldNotCheck("omp");
	if (models === 0) {
		return {
			state: "not-ready",
			reason: "omp has no model it can use: log in to a provider with `omp`, then hire",
		};
	}
	return { state: "ready" };
}
