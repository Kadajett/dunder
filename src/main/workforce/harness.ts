import type { Harness, RosterAgent } from "@shared/company/roster";

/** Typed into a worker's prompt to quit it cleanly; all three harnesses accept it. */
export const EXIT_COMMAND = "/exit";

export interface LaunchInput {
	readonly agent: RosterAgent;
	/** File holding the office protocol + "who you are" text. */
	readonly promptPath: string;
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
 * Codex has no instructions-file flag that adds to its own (`model_instructions_file`
 * replaces them), so its developer instructions say where the prompt file is.
 * The prompt itself never goes on the command line: herdr types the command
 * into the pane's shell, and a terminal line longer than 4095 bytes is cut,
 * which left an unclosed quote ('Syntax error: end of file unexpected').
 */
export function codexInstructions(name: string, promptPath: string): string {
	return [
		`You are ${name}, an agent in the office.`,
		`Your standing instructions, the office protocol and your role brief, are in the file ${promptPath}.`,
		"Read that whole file with cat before doing anything else, follow it for this entire session,",
		"and read it again after any context compaction.",
	].join(" ");
}

/**
 * Native arguments after `herdr agent start <name> --kind <harness> --pane <id> --`.
 * Every worker runs without approval prompts and with the office protocol in
 * its instructions. herdr types the command into a shell line, so the prompt
 * always travels as a file path, never as text.
 */
export function harnessArgs({ agent, promptPath, resume }: LaunchInput): string[] {
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
			`developer_instructions=${JSON.stringify(codexInstructions(agent.name, promptPath))}`,
			...(model === undefined ? [] : ["--model", model]),
		],
	};
	return builders[agent.harness]();
}
