import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SessionSnapshot, sessionSnapshotSchema } from "@shared/herdr/schema";
import type { WhiteboardChange } from "@shared/whiteboard";
import type { TLShape } from "@tldraw/tlschema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boardSnapshot, digestItems, openBoard } from "./board-doc";
import { WhiteboardService } from "./service";

const agent = (pane: string, name: string) => ({
	pane_id: pane,
	tab_id: "w1:t1",
	workspace_id: "w1",
	terminal_id: `t-${pane}`,
	focused: false,
	agent_status: "idle",
	agent: "omp",
	name,
});

const OFFICE: SessionSnapshot = sessionSnapshotSchema.parse({
	version: "0.9.3",
	protocol: 22,
	workspaces: [],
	tabs: [],
	panes: [],
	agents: [agent("w1:p1", "max"), agent("w1:p2", "nora")],
});

let counter = 0;
const request = (fields: Record<string, unknown>): string =>
	JSON.stringify({
		v: 1,
		id: `request-${++counter}-0000`,
		fromPane: "w1:p2",
		op: "note",
		text: "ship it",
		requestedAt: "2026-10-06T12:00:00.000Z",
		...fields,
	});

let dir = "";
let company = "acme";
let changes: WhiteboardChange[] = [];

function service(): WhiteboardService {
	return new WhiteboardService({
		dir: join(dir, "whiteboards"),
		digestPath: join(dir, "board.json"),
		currentCompanyId: async () => company,
		chiefName: () => "max",
		emit: (change) => changes.push(change),
		now: () => new Date("2026-10-06T12:00:00.000Z"),
	});
}

async function ready(): Promise<WhiteboardService> {
	const board = service();
	board.updateSnapshot(OFFICE);
	return board;
}

const shapesOf = (snapshot: unknown): TLShape[] =>
	openBoard(snapshot)
		.allRecords()
		.filter((record): record is TLShape => record.typeName === "shape");

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "whiteboard-"));
	company = "acme";
	changes = [];
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("whiteboard service", () => {
	it("turns an agent's note request into a signed note, saved, broadcast and readable", async () => {
		const board = await ready();
		await board.receive([request({ text: "ship it\ntoday", color: "green" })]);

		const saved = JSON.parse(await readFile(join(dir, "whiteboards", "acme.json"), "utf8"));
		expect(saved).toMatchObject({ version: 1, companyId: "acme", revision: 1 });
		const [note] = shapesOf(saved.snapshot);
		expect(note).toMatchObject({ type: "note", meta: { author: "nora" } });
		expect(note?.props).toMatchObject({ color: "light-green" });
		expect(digestItems(openBoard(saved.snapshot))).toEqual([
			{ kind: "note", author: "nora", text: "ship it\ntoday" },
		]);

		expect(changes.at(-1)?.cause).toMatchObject({ kind: "note", by: "nora", records: [note] });
		const digest = JSON.parse(await readFile(join(dir, "board.json"), "utf8"));
		expect(digest.items).toEqual([{ kind: "note", author: "nora", text: "ship it\ntoday" }]);
	});

	it("holds requests read before the first herdr snapshot until it names their author", async () => {
		const board = service();
		await board.receive([request({ op: "text", text: "Agenda" })]);
		board.updateSnapshot(OFFICE);
		const { snapshot } = await board.get();
		expect(shapesOf(snapshot).map((shape) => [shape.type, shape.meta["author"]])).toEqual([
			["text", "nora"],
		]);
	});

	it("round-trips the editor's snapshot, across a restart too", async () => {
		const board = await ready();
		await board.receive([request({}), request({ op: "text", text: "Agenda", x: 40, y: 900 })]);
		const loaded = await board.get();
		const saved = await board.put({
			companyId: "acme",
			baseRevision: loaded.revision,
			snapshot: loaded.snapshot,
		});
		expect(saved).toMatchObject({ state: "saved", merged: false, board: { revision: 3 } });
		const restarted = await service().get();
		expect(restarted.revision).toBe(3);
		expect(restarted.snapshot).toEqual(loaded.snapshot);
	});

	it("keeps a note posted after the editor last loaded, but not one the editor deleted", async () => {
		const board = await ready();
		const editorDoc = boardSnapshot(openBoard(null));
		await board.receive([request({ text: "late note" })]);
		const merged = await board.put({ companyId: "acme", baseRevision: 0, snapshot: editorDoc });
		expect(merged.state === "saved" && merged.merged).toBe(true);
		expect(digestItems(openBoard(merged.board.snapshot)).map((item) => item.text)).toEqual([
			"late note",
		]);

		// Jeremy deletes it after seeing it: his save is newer than the note, so it stays gone.
		const deleted = await board.put({
			companyId: "acme",
			baseRevision: merged.board.revision,
			snapshot: editorDoc,
		});
		expect(deleted.state === "saved" && deleted.merged).toBe(false);
		expect(shapesOf(deleted.board.snapshot)).toEqual([]);
	});

	it("lets only the chief clear, and refuses editor saves from before the clear", async () => {
		const board = await ready();
		await board.receive([request({})]);
		const before = await board.get();
		await board.receive([request({ op: "clear", text: undefined })]);
		expect(shapesOf((await board.get()).snapshot)).toHaveLength(1);

		await board.receive([request({ op: "clear", text: undefined, fromPane: "w1:p1" })]);
		const cleared = await board.get();
		expect(shapesOf(cleared.snapshot)).toEqual([]);
		expect(changes.at(-1)?.cause).toEqual({ kind: "clear", by: "max" });
		const stale = await board.put({
			companyId: "acme",
			baseRevision: before.revision,
			snapshot: before.snapshot,
		});
		expect(stale).toMatchObject({ state: "rejected", reason: "the board was cleared" });
	});

	it("follows the current company and refuses saves meant for the previous one", async () => {
		const board = await ready();
		await board.receive([request({})]);
		const acme = await board.get();
		company = "zeta";
		await board.companyChanged("zeta");
		expect(changes.at(-1)).toMatchObject({
			cause: { kind: "company" },
			board: { companyId: "zeta" },
		});
		expect((await board.get()).snapshot).toBeNull();
		const misplaced = await board.put({
			companyId: "acme",
			baseRevision: acme.revision,
			snapshot: acme.snapshot,
		});
		expect(misplaced).toMatchObject({ state: "rejected", reason: "the company changed" });
	});

	it("rejects an editor snapshot tldraw cannot validate and keeps the board", async () => {
		const board = await ready();
		await board.receive([request({})]);
		const loaded = await board.get();
		const store = {
			...loaded.snapshot?.store,
			"shape:bad": { id: "shape:bad", typeName: "shape" },
		};
		await expect(
			board.put({
				companyId: "acme",
				baseRevision: loaded.revision,
				snapshot: { ...loaded.snapshot, store },
			}),
		).rejects.toThrow();
		expect(await board.get()).toEqual(loaded);
	});
});
