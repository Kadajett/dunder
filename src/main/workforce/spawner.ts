import { z } from "zod";
import type { CliResult } from "../herdr/cli";
import type { PaneTarget, SpawnPlan } from "./plan";

/** Runs `herdr --session office <args>`; never any other session. */
export type OfficeCli = (args: readonly string[], timeoutMs?: number) => Promise<CliResult>;

/** How long a harness gets to become interactive (herdr's `--timeout`). */
const START_TIMEOUT_MS = 60_000;
/** The CLI call itself outlives herdr's readiness wait. */
const START_CLI_TIMEOUT_MS = START_TIMEOUT_MS + 15_000;

const paneRef = z.object({ pane_id: z.string().min(1) });
const createdSchema = z.object({ result: z.object({ root_pane: paneRef }) });
const splitSchema = z.object({ result: z.object({ pane: paneRef }) });
const liveAgentSchema = z.object({
	name: z.string().nullish(),
	pane_id: z.string().optional(),
	agent: z.string().optional(),
	agent_status: z.string().optional(),
});
export type LiveAgentInfo = z.infer<typeof liveAgentSchema>;
const agentListSchema = z.object({ result: z.object({ agents: z.array(liveAgentSchema) }) });

function parse<T>(schema: z.ZodType<T>, { stdout }: CliResult): T {
	return schema.parse(JSON.parse(stdout));
}

/** Every agent herdr detects right now. */
export async function liveAgents(cli: OfficeCli): Promise<LiveAgentInfo[]> {
	return parse(agentListSchema, await cli(["agent", "list"])).result.agents;
}

/** Names herdr detects right now: the last word before starting anything. */
export async function liveAgentNames(cli: OfficeCli): Promise<Set<string>> {
	return new Set((await liveAgents(cli)).flatMap((a) => (a.name ? [a.name] : [])));
}

/**
 * A start that timed out at a startup dialog (claude's or codex's folder-trust
 * prompt, say) can leave the harness running in the pane without its name.
 * Give it the name back so the worker is not started twice and shows up as
 * waiting for the human. True when the pane holds the worker.
 */
export async function reclaimStartedAgent(
	cli: OfficeCli,
	paneId: string,
	name: string,
	harness: string,
): Promise<boolean> {
	const live = (await liveAgents(cli)).find((agent) => agent.pane_id === paneId);
	if (!live || live.agent !== harness || (live.name && live.name !== name)) return false;
	if (!live.name) await cli(["agent", "rename", paneId, name]);
	return true;
}

type PaneEnv = Readonly<Record<string, string>>;

/** POSIX single-quoting: safe for any value, including spaces and quotes. */
function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A reused pane keeps the shell env it was created with, and `agent start` has
 * no `--env`; export each variable in that shell first so the harness inherits it.
 */
async function exportEnv(cli: OfficeCli, paneId: string, env: PaneEnv): Promise<void> {
	for (const [key, value] of Object.entries(env)) {
		if (!ENV_NAME.test(key)) throw new Error(`invalid environment variable name: ${key}`);
		await cli(["pane", "run", paneId, `export ${key}=${shellQuote(value)}`]);
	}
}

/** Produce an idle shell pane with `env` for the plan's target and return its id. */
async function preparePane(
	cli: OfficeCli,
	target: PaneTarget,
	env: PaneEnv,
	cwd: string,
): Promise<string> {
	const shell = [
		"--cwd",
		cwd,
		...Object.entries(env).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
		"--no-focus",
	];
	switch (target.kind) {
		case "reuse":
			await exportEnv(cli, target.paneId, env);
			return target.paneId;
		case "split": {
			const out = await cli(["pane", "split", target.paneId, "--direction", "right", ...shell]);
			return parse(splitSchema, out).result.pane.pane_id;
		}
		case "tab": {
			const out = await cli(["tab", "create", "--workspace", target.workspaceId, ...shell]);
			return parse(createdSchema, out).result.root_pane.pane_id;
		}
		case "workspace": {
			const out = await cli(["workspace", "create", "--label", target.label, ...shell]);
			return parse(createdSchema, out).result.root_pane.pane_id;
		}
	}
}

export interface SpawnHooks {
	/** Environment for the worker's shell (`KEY` → value), e.g. a PATH with the office CLI. */
	readonly env: PaneEnv;
	/**
	 * Learns the pane before the harness starts, so a failed start leaves a bare shell
	 * the next attempt reuses instead of splitting another one.
	 */
	readonly onPane: (paneId: string) => void;
}

/** Start the planned worker (`args` after `--`) in a fresh (or reused) shell pane. */
export async function executeSpawn(
	cli: OfficeCli,
	plan: SpawnPlan,
	args: readonly string[],
	hooks: SpawnHooks,
): Promise<void> {
	const paneId = await preparePane(cli, plan.target, hooks.env, plan.agent.cwd);
	hooks.onPane(paneId);
	const { name, harness } = plan.agent;
	const start = ["agent", "start", name, "--kind", harness, "--pane", paneId];
	await cli([...start, "--timeout", String(START_TIMEOUT_MS), "--", ...args], START_CLI_TIMEOUT_MS);
}
