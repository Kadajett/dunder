import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Roster, rosterSchema } from "@shared/company/roster";
import { agent, pane, snapshot, workspace } from "@shared/herdr/fixtures/snapshot";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliResult } from "../herdr/cli";
import { MISSING_GRACE_MS } from "./plan";
import type { SeedSource } from "./seed";
import { WorkforceSupervisor } from "./supervisor";

const workspaces = [workspace("w1", "sales")];
const staffed = snapshot({
	workspaces,
	agents: [agent("nora", "w1:p1", "/s/nora.jsonl"), agent("jonas", "w1:p4", "/s/jonas.jsonl")],
});
const jonasGone = snapshot({ workspaces, agents: [agent("nora", "w1:p1", "/s/nora.jsonl")] });

let dir = "";
let clock = 0;
let calls: string[][] = [];
/** Make `agent start` fail, as herdr does when a harness stops at a startup dialog. */
let failStart = false;
const running: WorkforceSupervisor[] = [];

/** A live agent by name, or an unnamed one in a pane. */
type LiveEntry = string | { readonly pane_id: string; readonly agent: string };

/** Fake `herdr --session office`: `agent list` reports `live`, splits yield `w1:p9`. */
function fakeCli(live: () => readonly LiveEntry[]) {
	return async (args: readonly string[]): Promise<CliResult> => {
		calls.push([...args]);
		const [group, verb] = args;
		if (failStart && group === "agent" && verb === "start") throw new Error("startup timed out");
		const agents = live().map((entry) => (typeof entry === "string" ? { name: entry } : entry));
		const json =
			group === "agent" && verb === "list"
				? { result: { agents } }
				: group === "pane" && verb === "split"
					? { result: { pane: { pane_id: "w1:p9" } } }
					: { result: {} };
		return { stdout: JSON.stringify(json), stderr: "" };
	};
}

async function supervisor(live: () => readonly LiveEntry[] = () => [], seed?: SeedSource) {
	const changes: Roster[] = [];
	let id = 0;
	const sup = new WorkforceSupervisor({
		rosterPath: join(dir, "roster.json"),
		spawn: {
			promptDir: join(dir, "prompts"),
			protocolPath: join(dir, "protocol.md"),
			paneEnv: { PATH: "/office/bin:/usr/bin" },
		},
		cli: fakeCli(live),
		sessionExists: (path) => path === "/s/jonas.jsonl",
		onChange: (roster) => changes.push(roster),
		now: () => clock,
		newId: () => `id-${++id}`,
		...(seed && { seed }),
	});
	running.push(sup);
	await sup.start();
	return { sup, changes };
}

async function savedNames(): Promise<string[]> {
	const roster = rosterSchema.parse(JSON.parse(await readFile(join(dir, "roster.json"), "utf8")));
	return roster.agents.map((a) => a.name);
}

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "workforce-"));
	clock = 1_000_000;
	calls = [];
	failStart = false;
	await writeFile(join(dir, "protocol.md"), "# Office protocol\n");
});
afterEach(async () => {
	for (const sup of running.splice(0)) sup.stop();
	await rm(dir, { recursive: true, force: true });
});

describe("WorkforceSupervisor", () => {
	it("adopts the live staff on first run only, and persists the roster", async () => {
		const first = await supervisor();
		first.sup.handleSnapshot(staffed);
		await first.sup.settled();
		expect(await savedNames()).toEqual(["nora", "jonas"]);
		expect(first.changes.at(-1)?.agents.map((a) => a.name)).toEqual(["nora", "jonas"]);
		first.sup.stop();

		const second = await supervisor();
		const newcomer = snapshot({
			workspaces,
			agents: [...staffed.agents, agent("temp", "w1:p7")],
		});
		second.sup.handleSnapshot(newcomer);
		await second.sup.settled();
		expect(second.sup.roster()?.agents.map((a) => a.name)).toEqual(["nora", "jonas"]);
		expect(await savedNames()).toEqual(["nora", "jonas"]);
	});

	it("respawns a vanished worker in yolo mode with the office prompt, resuming its session", async () => {
		const { sup } = await supervisor(() => ["nora"]);
		sup.handleSnapshot(staffed);
		sup.handleSnapshot(jonasGone);
		await sup.settled();
		expect(await savedNames()).toHaveLength(2);
		expect(calls.filter((c) => c[1] === "start")).toEqual([]);

		clock += MISSING_GRACE_MS;
		sup.handleSnapshot(snapshot({ workspaces, panes: [pane("w1:p2")], agents: jonasGone.agents }));
		await sup.settled();
		expect(calls.find((c) => c[0] === "pane")).toEqual([
			"pane",
			"split",
			"w1:p2",
			"--direction",
			"right",
			"--cwd",
			"/work",
			"--env",
			"PATH=/office/bin:/usr/bin",
			"--no-focus",
		]);
		expect(calls.find((c) => c[1] === "start")).toEqual([
			"agent",
			"start",
			"jonas",
			"--kind",
			"omp",
			"--pane",
			"w1:p9",
			"--timeout",
			"60000",
			"--",
			"--approval-mode=yolo",
			`--append-system-prompt=${join(dir, "prompts", "jonas.md")}`,
			"--resume=/s/jonas.jsonl",
		]);
		const prompt = await readFile(join(dir, "prompts", "jonas.md"), "utf8");
		expect(prompt).toContain("# Office protocol");
		expect(prompt).toContain("You are jonas, the office's generalist, working in the sales room.");
	});

	it("does not start a second copy when herdr already sees the worker", async () => {
		const { sup } = await supervisor(() => ["nora", "jonas"]);
		sup.handleSnapshot(staffed);
		sup.handleSnapshot(jonasGone);
		await sup.settled();
		clock += MISSING_GRACE_MS;
		sup.handleSnapshot(jonasGone);
		await sup.settled();
		expect(calls.filter((c) => c[1] === "list")).toHaveLength(1);
		expect(calls.filter((c) => c[0] !== "agent")).toEqual([]);
	});

	it("starts a hired worker right away with its own harness", async () => {
		const { sup } = await supervisor(() => ["nora", "jonas"]);
		sup.handleSnapshot(staffed);
		await sup.settled();
		await sup.hire({
			name: "kim",
			role: "backend",
			harness: "claude",
			workspaceLabel: "sales",
			cwd: "/work",
		});
		sup.handleSnapshot(snapshot({ workspaces, panes: [pane("w1:p2")], agents: staffed.agents }));
		await sup.settled();
		const start = calls.find((c) => c[1] === "start");
		expect(start?.slice(0, 5)).toEqual(["agent", "start", "kim", "--kind", "claude"]);
		expect(start?.slice(start.indexOf("--") + 1)).toEqual([
			"--dangerously-skip-permissions",
			"--append-system-prompt-file",
			join(dir, "prompts", "kim.md"),
		]);
		await expect(
			sup.hire({ name: "kim", role: "x", workspaceLabel: "sales", cwd: "/work" }),
		).rejects.toThrow();
	});

	it("never respawns a fired worker", async () => {
		const { sup } = await supervisor(() => ["nora"]);
		sup.handleSnapshot(staffed);
		await sup.settled();
		expect(await sup.fire("jonas")).toBe(true);
		expect(await sup.fire("nobody")).toBe(false);
		sup.respawnSoon("jonas");
		clock += MISSING_GRACE_MS;
		sup.handleSnapshot(snapshot({ workspaces, panes: [pane("w1:p2")], agents: jonasGone.agents }));
		await sup.settled();
		expect(calls.filter((c) => c[1] === "start")).toEqual([]);
		expect(sup.roster()?.agents.find((a) => a.name === "jonas")?.firedAt).toBeDefined();
	});

	it("names a harness held at a startup dialog instead of starting it again", async () => {
		let live: LiveEntry[] = ["nora", "jonas"];
		const { sup } = await supervisor(() => live);
		sup.handleSnapshot(staffed);
		await sup.settled();
		failStart = true;
		live = ["nora", "jonas", { pane_id: "w1:p9", agent: "codex" }];
		await sup.hire({
			name: "kim",
			role: "x",
			harness: "codex",
			workspaceLabel: "sales",
			cwd: "/w",
		});
		await sup.settled();
		expect(calls.filter((c) => c[1] === "rename")).toEqual([["agent", "rename", "w1:p9", "kim"]]);
		live = ["nora", "jonas", "kim"];
		clock += 60_000;
		sup.handleSnapshot(staffed);
		await sup.settled();
		expect(calls.filter((c) => c[1] === "start")).toHaveLength(1);
	});

	it("hires the seeded staff into an empty roster once and starts them without a grace wait", async () => {
		let loads = 0;
		let applied = 0;
		const seed: SeedSource = {
			load: async () => {
				loads++;
				return [{ name: "dwight", role: "backend", workspaceLabel: "sales", cwd: "/work" }];
			},
			applied: async () => {
				applied++;
			},
		};
		const { sup } = await supervisor(() => [], seed);
		expect(await savedNames()).toEqual(["dwight"]);
		expect(applied).toBe(1);
		sup.handleSnapshot(snapshot({ workspaces, panes: [pane("w1:p2")], agents: [] }));
		await sup.settled();
		expect(calls.find((c) => c[1] === "start")?.slice(0, 3)).toEqual(["agent", "start", "dwight"]);
		sup.stop();

		await supervisor(() => [], seed);
		expect([loads, applied]).toEqual([1, 1]);
	});
});
