import type { WorkBoard } from "@shared/work-board";
import { describe, expect, it } from "vitest";
import { movePlan, WORK_POLL_MS, WorkBoardService } from "./service";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const SINCE = "2026-10-05T12:00:00.000Z";
const READS = [
	["list", "--json", "--status=open,in_progress,blocked", "-n", "0"],
	["blocked", "--json"],
	["ready", "--json", "-n", "0"],
	["list", "--json", "--status=closed", `--closed-after=${SINCE}`, "-n", "0"],
];

function bead(
	id: string,
	status: string,
	extra: Record<string, unknown> = {},
): Record<string, unknown> {
	return { id, title: id, status, priority: 2, updated_at: "2026-10-06T10:00:00Z", ...extra };
}

const READ_COMMANDS = ["list", "blocked", "ready"];

/** A fake bd: answers reads from `fake.open`, `show` from `statuses`, records every argv. */
function harness(statuses: Record<string, string> = {}) {
	const calls: string[][] = [];
	const emitted: WorkBoard[] = [];
	const notes: [string, string][] = [];
	const timers: { callback: () => void; ms: number }[] = [];
	const fake = { open: [bead("a-1", "open")], fail: "", failWrite: "" };
	const read = (args: readonly string[]): unknown[] => {
		const [command, id = ""] = args;
		if (command === "show") return [bead(id, statuses[id] ?? "open")];
		const isOpenList = args.includes("--status=open,in_progress,blocked");
		return isOpenList || command === "ready" ? fake.open : [];
	};
	const runBd = async (args: readonly string[], cwd: string): Promise<string> => {
		calls.push([cwd, ...args]);
		if (fake.fail) throw new Error(fake.fail);
		const isRead = READ_COMMANDS.includes(args[0] ?? "") || args[0] === "show";
		if (isRead) return JSON.stringify(read(args));
		if (fake.failWrite) throw new Error(fake.failWrite);
		return "ok\n";
	};
	const service = new WorkBoardService({
		runBd,
		cwd: "/repo",
		now: () => NOW,
		setTimer: (callback, ms) => {
			const timer = { callback, ms };
			timers.push(timer);
			return () => timers.splice(timers.indexOf(timer), 1);
		},
		emit: (board) => emitted.push(board),
		notify: (agent, text) => notes.push([agent, text]),
	});
	const writes = () => calls.filter(([, command]) => !READ_COMMANDS.includes(command ?? ""));
	return { service, calls, emitted, timers, fake, writes, notes };
}

describe("WorkBoardService reads", () => {
	it("reads bd in the repo and emits the board only when it changed", async () => {
		const { service, calls, emitted, fake } = harness();
		await service.refresh();
		expect(calls).toEqual(READS.map((args) => ["/repo", ...args]));
		expect(emitted).toEqual([
			{ state: "ok", cards: [expect.objectContaining({ id: "a-1", lane: "ready" })], asks: [] },
		]);
		await service.refresh();
		expect(emitted).toHaveLength(1);
		fake.open = [bead("a-1", "in_progress")];
		await service.refresh();
		expect(emitted).toHaveLength(2);
		expect(await service.get()).toEqual(emitted[1]);
	});

	it("reports bd failures as unavailable, and recovers", async () => {
		const { service, emitted, fake } = harness();
		fake.fail = "bd: command not found";
		await service.refresh();
		expect(emitted).toEqual([{ state: "unavailable", reason: "bd: command not found" }]);
		fake.fail = "";
		await service.refresh();
		expect(emitted[1]).toMatchObject({ state: "ok" });
	});

	it("reports unparseable bd output as unavailable", async () => {
		const { service, emitted, fake } = harness();
		fake.open = [{ id: "a-1" }];
		await service.refresh();
		expect(emitted[0]).toMatchObject({ state: "unavailable" });
	});

	it("never runs two reads at once; a refresh during a read reads once more after it", async () => {
		const { service, calls } = harness();
		const first = service.refresh();
		const second = service.refresh();
		const third = service.refresh();
		expect(calls).toHaveLength(1);
		await Promise.all([first, second, third]);
		expect(calls).toHaveLength(READS.length * 2);
	});

	it("polls every 5 s after each read finishes, and stops", async () => {
		const { service, calls, timers } = harness();
		service.start();
		await service.refresh();
		expect(timers.map((timer) => timer.ms)).toEqual([WORK_POLL_MS]);
		const before = calls.length;
		timers.shift()?.callback();
		expect(calls).toHaveLength(before + 1);
		await service.refresh();
		expect(timers.map((timer) => timer.ms)).toEqual([WORK_POLL_MS]);
		service.stop();
		expect(timers).toEqual([]);
	});
});

describe("WorkBoardService writes", () => {
	it("runs each write as its bd command, then refreshes", async () => {
		const { service, calls, writes } = harness();
		expect(await service.create("Ship it")).toEqual({ ok: true });
		expect(calls.slice(1, 1 + READS.length).map(([, ...args]) => args)).toEqual(READS);
		await service.setPriority("a-1", 0);
		await service.assign("a-1", "theo");
		await service.assign("a-1", null);
		expect(writes()).toEqual([
			["/repo", "create", "--title=Ship it", "--type=task", "--priority=2"],
			["/repo", "update", "a-1", "--priority=0"],
			["/repo", "update", "a-1", "--assignee=theo"],
			["/repo", "update", "a-1", "--assignee="],
		]);
		expect(calls).toHaveLength(4 + 4 * READS.length);
	});

	it("moves by status, reopening a closed bead first", async () => {
		const { service, writes } = harness({ "a-1": "open", "a-2": "closed" });
		await service.move("a-1", "in_progress");
		await service.move("a-2", "blocked");
		expect(writes()).toEqual([
			["/repo", "show", "a-1", "--json"],
			["/repo", "update", "a-1", "--status=in_progress"],
			["/repo", "show", "a-2", "--json"],
			["/repo", "reopen", "a-2"],
			["/repo", "update", "a-2", "--status=blocked"],
		]);
	});

	it("returns bd's error and still refreshes", async () => {
		const { service, calls, fake } = harness();
		fake.failWrite = "Error: issue a-1 not found";
		expect(await service.setPriority("a-1", 1)).toEqual({
			ok: false,
			reason: "Error: issue a-1 not found",
		});
		expect(calls).toHaveLength(1 + READS.length);
	});

	it("answers an ask as a comment plus a close and tells the agent who asked; dismissing closes it", async () => {
		const { service, fake, writes, notes } = harness();
		fake.open = [
			bead("ask-1", "open", {
				labels: ["human"],
				assignee: "nora",
				title: "npm login + NPM_TOKEN",
			}),
			bead("ask-2", "open", { labels: ["human"], assignee: "mika", title: "ElevenLabs OK?" }),
		];
		await service.refresh();
		await service.respond("ask-1", "--done, token set");
		await service.dismiss("ask-2");
		expect(writes()).toEqual([
			["/repo", "comments", "add", "ask-1", "--", "--done, token set"],
			["/repo", "close", "ask-1", "--reason=Responded"],
			["/repo", "close", "ask-2", "--reason=Dismissed"],
		]);
		expect(notes).toEqual([
			["nora", 'Jeremy answered your ask ask-1 ("npm login + NPM_TOKEN"): --done, token set'],
			["mika", 'Jeremy dismissed your ask ask-2 ("ElevenLabs OK?") without an answer.'],
		]);
	});

	it("tells nobody when bd refuses the answer", async () => {
		const { service, fake, notes } = harness();
		fake.open = [bead("ask-1", "open", { labels: ["human"], assignee: "nora" })];
		await service.refresh();
		fake.failWrite = "Error: issue ask-1 not found";
		expect(await service.respond("ask-1", "ok")).toEqual({
			ok: false,
			reason: "Error: issue ask-1 not found",
		});
		expect(notes).toEqual([]);
	});
});

describe("movePlan", () => {
	it.each([
		["open", "in_progress", [["update", "a-1", "--status=in_progress"]]],
		["in_progress", "blocked", [["update", "a-1", "--status=blocked"]]],
		["blocked", "ready", [["update", "a-1", "--status=open"]]],
		["in_progress", "done", [["close", "a-1"]]],
		["closed", "done", []],
		["closed", "ready", [["reopen", "a-1"]]],
		[
			"closed",
			"in_progress",
			[
				["reopen", "a-1"],
				["update", "a-1", "--status=in_progress"],
			],
		],
	] as const)("%s → %s", (status, lane, plan) => {
		expect(movePlan("a-1", status, lane)).toEqual(plan);
	});
});
