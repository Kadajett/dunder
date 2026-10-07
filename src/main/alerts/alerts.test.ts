import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AlertTarget } from "@shared/alerts";
import type { AgentInfo, SessionSnapshot } from "@shared/herdr/schema";
import type { HumanAsk, WorkBoard } from "@shared/work-board";
import { beforeEach, describe, expect, it } from "vitest";
import { AlertService } from "./service";
import { BATCH_MS, batchNotice } from "./triggers";

const agent = (name: string, status: AgentInfo["agent_status"], title?: string) =>
	({
		pane_id: `p-${name}`,
		tab_id: "t",
		workspace_id: "w",
		terminal_id: `t-${name}`,
		focused: false,
		agent_status: status,
		agent: "omp",
		name,
		...(title !== undefined && { terminal_title_stripped: title }),
	}) as AgentInfo;
const snapshot = (...agents: AgentInfo[]) => ({ agents }) as unknown as SessionSnapshot;
const ask = (id: string, question: string): HumanAsk => ({
	id,
	question,
	detail: "",
	asker: "nora",
	blocks: [],
	createdAt: "2026-10-07T10:00:00Z",
});
const board = (...asks: HumanAsk[]): WorkBoard => ({ state: "ok", revision: 1, cards: [], asks });

let settingsPath: string;
beforeEach(async () => {
	settingsPath = join(await mkdtemp(join(tmpdir(), "alerts-")), "alerts.json");
});

function harness() {
	let now = 0;
	let focused = false;
	const shown: string[] = [];
	const opened: AlertTarget[] = [];
	let clickLast: () => void = () => undefined;
	let chimes = 0;
	const service = new AlertService({
		settingsPath,
		now: () => now,
		isFocused: () => focused,
		show: (notice, onClick) => {
			shown.push(`${notice.title} | ${notice.body}`);
			clickLast = onClick;
		},
		chime: () => {
			chimes += 1;
		},
		open: (target) => opened.push(target),
	});
	return {
		service,
		shown,
		opened,
		chimes: () => chimes,
		click: () => clickLast(),
		at: (ms: number) => {
			now = ms;
		},
		focus: (value: boolean) => {
			focused = value;
		},
	};
}

describe("AlertService", () => {
	it("fires once when an agent turns blocked, never for those blocked at startup, and re-arms after", () => {
		const h = harness();
		h.service.updateSnapshot(
			snapshot(agent("ava", "blocked"), agent("theo", "working", "π > Build lkv")),
		);
		expect(h.shown).toEqual([]);
		h.service.updateSnapshot(
			snapshot(agent("ava", "blocked"), agent("theo", "blocked", "π > Build lkv")),
		);
		expect(h.shown).toEqual(["theo needs you | Build lkv"]);
		expect(h.chimes()).toBe(1);
		h.service.updateSnapshot(snapshot(agent("ava", "blocked"), agent("theo", "blocked")));
		expect(h.shown).toHaveLength(1);
		h.click();
		expect(h.opened).toEqual([{ kind: "blocked", paneId: "p-theo" }]);
	});

	it("fires for a new ask with its text, not for asks open at startup", () => {
		const h = harness();
		h.service.updateBoard(board(ask("o-1", "Old ask")));
		h.service.updateBoard(board(ask("o-1", "Old ask"), ask("o-2", "Paste the NPM_TOKEN?")));
		expect(h.shown).toEqual(["nora needs you | Paste the NPM_TOKEN?"]);
	});

	it("collapses triggers within 30 s into one notification and one chime, then starts a new batch", () => {
		const h = harness();
		h.service.updateSnapshot(snapshot(agent("ava", "working"), agent("ben", "working")));
		h.service.updateBoard(board());
		h.service.updateSnapshot(snapshot(agent("ava", "blocked"), agent("ben", "working")));
		h.at(10_000);
		h.service.updateBoard(board(ask("o-3", "OK to deploy?")));
		h.at(20_000);
		h.service.updateSnapshot(snapshot(agent("ava", "blocked"), agent("ben", "blocked")));
		expect(h.shown.at(-1)).toBe("3 things need you | ava, nora, ben");
		expect(h.chimes()).toBe(1);
		h.click();
		expect(h.opened).toEqual([{ kind: "blocked", paneId: "p-ava" }]);
		h.at(BATCH_MS + 1);
		h.service.updateSnapshot(snapshot(agent("ava", "working"), agent("ben", "blocked")));
		h.service.updateSnapshot(snapshot(agent("ava", "blocked"), agent("ben", "blocked")));
		expect(h.shown.at(-1)).toBe("ava needs you | is waiting on you");
		expect(h.chimes()).toBe(2);
	});

	it("stays quiet while Dunder is focused, and for done or other statuses", () => {
		const h = harness();
		h.service.updateSnapshot(snapshot(agent("ava", "working"), agent("ben", "working")));
		h.focus(true);
		h.service.updateSnapshot(snapshot(agent("ava", "blocked"), agent("ben", "working")));
		h.focus(false);
		h.service.updateSnapshot(snapshot(agent("ava", "blocked"), agent("ben", "done")));
		h.service.updateSnapshot(snapshot(agent("ava", "idle"), agent("ben", "working")));
		expect(h.shown).toEqual([]);
		expect(h.chimes()).toBe(0);
	});

	it("is silenced by the mute, which persists across restarts", async () => {
		const h = harness();
		expect(await h.service.muted()).toBe(false);
		await h.service.setMuted(true);
		h.service.updateSnapshot(snapshot(agent("ava", "working")));
		h.service.updateSnapshot(snapshot(agent("ava", "blocked")));
		expect([h.shown, h.chimes()]).toEqual([[], 0]);
		expect(await harness().service.muted()).toBe(true);
	});
});

describe("batchNotice", () => {
	it("clips a long body", () => {
		const notice = batchNotice([
			{ who: "ava", text: "x".repeat(200), target: { kind: "ask", id: "o-1" } },
		]);
		expect(notice.body).toHaveLength(120);
		expect(notice.body.endsWith("…")).toBe(true);
	});
});
