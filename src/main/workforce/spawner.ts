import { z } from "zod";
import type { CliResult } from "../herdr/cli";
import type { PaneTarget, SpawnPlan } from "./plan";

/** Runs `herdr --session office <args>`; never any other session. */
export type OfficeCli = (args: readonly string[], timeoutMs?: number) => Promise<CliResult>;

/** How long omp gets to become interactive (herdr's `--timeout`). */
const START_TIMEOUT_MS = 60_000;
/** The CLI call itself outlives herdr's readiness wait. */
const START_CLI_TIMEOUT_MS = START_TIMEOUT_MS + 15_000;

const paneRef = z.object({ pane_id: z.string().min(1) });
const createdSchema = z.object({ result: z.object({ root_pane: paneRef }) });
const splitSchema = z.object({ result: z.object({ pane: paneRef }) });
const agentListSchema = z.object({
	result: z.object({ agents: z.array(z.object({ name: z.string().nullish() })) }),
});

function parse<T>(schema: z.ZodType<T>, { stdout }: CliResult): T {
	return schema.parse(JSON.parse(stdout));
}

/** Names herdr detects right now: the last word before starting anything. */
export async function liveAgentNames(cli: OfficeCli): Promise<Set<string>> {
	const { result } = parse(agentListSchema, await cli(["agent", "list"]));
	return new Set(result.agents.flatMap((a) => (a.name ? [a.name] : [])));
}

/** Produce an idle shell pane for the plan's target and return its id. */
async function preparePane(
	cli: OfficeCli,
	target: PaneTarget,
	shell: readonly string[],
): Promise<string> {
	switch (target.kind) {
		case "reuse":
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
	/** Environment for new shell panes (`KEY` → value), e.g. a PATH with the office CLI. */
	readonly env: Readonly<Record<string, string>>;
	/**
	 * Learns the pane before omp starts, so a failed start leaves a bare shell
	 * the next attempt reuses instead of splitting another one.
	 */
	readonly onPane: (paneId: string) => void;
}

/** Start the planned worker in a fresh (or reused) shell pane. */
export async function executeSpawn(
	cli: OfficeCli,
	plan: SpawnPlan,
	hooks: SpawnHooks,
): Promise<void> {
	const env = Object.entries(hooks.env).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
	const shell = ["--cwd", plan.agent.cwd, ...env, "--no-focus"];
	const paneId = await preparePane(cli, plan.target, shell);
	hooks.onPane(paneId);
	const { name } = plan.agent;
	const start = ["agent", "start", name, "--kind", "omp", "--pane", paneId];
	await cli(
		[...start, "--timeout", String(START_TIMEOUT_MS), "--", ...plan.args],
		START_CLI_TIMEOUT_MS,
	);
}
