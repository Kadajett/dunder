import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SessionSnapshot, sessionSnapshotSchema } from "@shared/herdr/schema";
import type { OfficeMessage } from "@shared/switchboard";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mailboxPath } from "../../cli/office-say.mts";
import { HerdrApiError } from "../herdr/api-client";
import { officeMailboxPath } from "./service";
import { Switchboard } from "./switchboard";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function office(statuses: Record<string, "idle" | "working" | "blocked">): SessionSnapshot {
	const agents = Object.entries(statuses).map(([name, status], index) => ({
		pane_id: `w1:p${index + 1}`,
		tab_id: "w1:t1",
		workspace_id: "w1",
		terminal_id: `t${index}`,
		focused: false,
		agent_status: status,
		agent: "omp",
		name,
	}));
	return sessionSnapshotSchema.parse({
		version: "0.9.3",
		protocol: 22,
		workspaces: [],
		tabs: [],
		panes: [],
		agents,
	});
}

function setup(call: (method: string, params: unknown) => Promise<unknown>) {
	const dir = mkdtempSync(join(tmpdir(), "switchboard-"));
	dirs.push(dir);
	const emitted: OfficeMessage[] = [];
	const board = new Switchboard({
		api: { call: (method, params) => call(method, params) },
		mailboxPath: join(dir, "mailbox.ndjson"),
		statePath: join(dir, "state.json"),
		emit: (message) => emitted.push(message),
	});
	const send = (fromPane: string, to: string, text: string) =>
		appendFileSync(
			join(dir, "mailbox.ndjson"),
			`${JSON.stringify({ v: 1, id: crypto.randomUUID(), fromPane, to, text, sentAt: new Date().toISOString() })}\n`,
		);
	return { board, emitted, send, dir };
}

describe("Switchboard", () => {
	it("attributes, queues and delivers a message once the recipient is free", async () => {
		const call = vi.fn(async () => ({ type: "agent_prompted" }));
		const { board, emitted, send } = setup(call);
		board.updateSnapshot(office({ nora: "idle", ava: "working" }));
		await board.start();
		send("w1:p1", "ava", "can you review the delivery board?");
		await vi.waitFor(() =>
			expect(emitted.at(-1)).toMatchObject({ from: "nora", to: "ava", state: "queued" }),
		);
		expect(call).not.toHaveBeenCalled();
		board.updateSnapshot(office({ nora: "idle", ava: "idle" }));
		await vi.waitFor(() => expect(emitted.at(-1)?.state).toBe("delivered"));
		expect(call).toHaveBeenCalledWith("agent.prompt", {
			target: "ava",
			text: expect.stringContaining(
				"[office message from nora] can you review the delivery board?",
			),
		});
		board.stop();
	});

	it("retries when herdr reports the recipient blocked, and skips malformed lines", async () => {
		const call = vi
			.fn<(method: string, params: unknown) => Promise<unknown>>()
			.mockRejectedValueOnce(new HerdrApiError("agent_blocked", "waiting on a dialog"))
			.mockResolvedValue({ type: "agent_prompted" });
		const { board, emitted, send, dir } = setup(call);
		board.updateSnapshot(office({ nora: "idle", ben: "idle" }));
		await board.start();
		appendFileSync(join(dir, "mailbox.ndjson"), "not json\n");
		send("w1:p1", "ben", "hi");
		await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
		expect(emitted.some((m) => m.state === "failed")).toBe(false);
		await board.pump();
		await vi.waitFor(() => expect(emitted.at(-1)?.state).toBe("delivered"));
		board.stop();
	});

	it("persists how far it read, so a restart does not redeliver", async () => {
		const call = vi.fn(async () => ({}));
		const first = setup(call);
		first.board.updateSnapshot(office({ nora: "idle", ava: "idle" }));
		await first.board.start();
		first.send("w1:p1", "ava", "once");
		await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
		await vi.waitFor(() =>
			expect(
				JSON.parse(readFileSync(join(first.dir, "state.json"), "utf8")).offset,
			).toBeGreaterThan(0),
		);
		first.board.stop();
		const again = new Switchboard({
			api: { call },
			mailboxPath: join(first.dir, "mailbox.ndjson"),
			statePath: join(first.dir, "state.json"),
			emit: () => undefined,
		});
		again.updateSnapshot(office({ nora: "idle", ava: "idle" }));
		await again.start();
		// A fresh message after the restart is the only one delivered: "once" is not resent.
		first.send("w1:p1", "ava", "twice");
		await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(2));
		expect(call).toHaveBeenLastCalledWith(
			"agent.prompt",
			expect.objectContaining({ text: expect.stringContaining("twice") }),
			expect.any(Number),
		);
		again.stop();
	});
});

describe("office-say mailbox path", () => {
	it.each([
		["the office-say CLI", mailboxPath],
		["the app", officeMailboxPath],
	])("%s honours XDG_STATE_HOME and falls back to ~/.local/state", (_who, path) => {
		expect(path({ XDG_STATE_HOME: "/s" }, "/home/j")).toBe("/s/dunder/mailbox.ndjson");
		expect(path({}, "/home/j")).toBe("/home/j/.local/state/dunder/mailbox.ndjson");
		expect(path({ XDG_STATE_HOME: "" }, "/home/j")).toBe(
			"/home/j/.local/state/dunder/mailbox.ndjson",
		);
	});
});
