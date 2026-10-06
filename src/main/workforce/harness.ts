import type { Harness, RosterAgent } from "@shared/company/roster";

/** Typed into a worker's prompt to quit it cleanly; all three harnesses accept it. */
export const EXIT_COMMAND = "/exit";

export interface LaunchInput {
	readonly agent: RosterAgent;
	/** File holding the office protocol + "who you are" text. */
	readonly promptPath: string;
	/** The same text, for harnesses that take it inline. */
	readonly prompt: string;
	/** Session to resume (see `resumeRef`); undefined starts fresh. */
	readonly resume: string | undefined;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * What to resume a worker from, or undefined to start fresh. omp resumes its
 * session file when it still exists. claude and codex resume by session id:
 * herdr may report the id itself or a session file whose name ends in it
 * (`<id>.jsonl`, `rollout-<time>-<id>.jsonl`).
 */
export function resumeRef(
	agent: Pick<RosterAgent, "harness" | "lastSessionPath">,
	sessionExists: (path: string) => boolean,
): string | undefined {
	const stored = agent.lastSessionPath;
	if (stored === undefined) return undefined;
	const isPath = stored.startsWith("/");
	if (isPath && !sessionExists(stored)) return undefined;
	if (agent.harness === "omp") return isPath ? stored : undefined;
	return stored.match(UUID)?.at(-1);
}

/**
 * Native arguments after `herdr agent start <name> --kind <harness> --pane <id> --`.
 * Every worker runs without approval prompts and with the office protocol in
 * its instructions. herdr cannot type multi-line arguments into a shell, so
 * the prompt travels as a file (omp, claude) or a one-line TOML string (codex).
 */
export function harnessArgs({ agent, promptPath, prompt, resume }: LaunchInput): string[] {
	const { model } = agent;
	const builders: Record<Harness, () => string[]> = {
		omp: () => [
			"--approval-mode=yolo",
			`--append-system-prompt=${promptPath}`,
			...(model === undefined ? [] : [`--model=${model}`]),
			...(resume === undefined ? [] : [`--resume=${resume}`]),
		],
		claude: () => [
			"--dangerously-skip-permissions",
			"--append-system-prompt-file",
			promptPath,
			...(model === undefined ? [] : ["--model", model]),
			...(resume === undefined ? [] : ["--resume", resume]),
		],
		codex: () => [
			...(resume === undefined ? [] : ["resume", resume]),
			"--dangerously-bypass-approvals-and-sandbox",
			"-c",
			// JSON string escapes are valid TOML basic-string escapes.
			`developer_instructions=${JSON.stringify(prompt)}`,
			...(model === undefined ? [] : ["--model", model]),
		],
	};
	return builders[agent.harness]();
}
