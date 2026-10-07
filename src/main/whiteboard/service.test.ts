import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SessionSnapshot, sessionSnapshotSchema } from "@shared/herdr/schema";
import type { WhiteboardChange, WhiteboardElement, WhiteboardScene } from "@shared/whiteboard";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { digestItems, EMPTY_SCENE } from "./board-doc";
import { type WhiteboardDeps, WhiteboardService } from "./service";

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

function service(overrides: Partial<WhiteboardDeps> = {}): WhiteboardService {
	return new WhiteboardService({
		dir: join(dir, "whiteboards"),
		digestPath: join(dir, "board.json"),
		currentCompanyId: async () => company,
		chiefName: () => "max",
		emit: (change) => changes.push(change),
		now: () => new Date("2026-10-06T12:00:00.000Z"),
		...overrides,
	});
}

async function ready(): Promise<WhiteboardService> {
	const board = service();
	board.updateSnapshot(OFFICE);
	return board;
}

const live = (scene: WhiteboardScene | null | undefined): WhiteboardElement[] =>
	(scene?.elements ?? []).filter((element) => !element.isDeleted);

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
		expect(saved).toMatchObject({ version: 2, companyId: "acme", revision: 1 });
		const [note, label] = live(saved.scene);
		expect(note).toMatchObject({
			type: "rectangle",
			backgroundColor: "#b2f2bb",
			customData: { author: "nora", kind: "note" },
			boundElements: [{ type: "text", id: label?.id }],
		});
		expect(label).toMatchObject({
			type: "text",
			containerId: note?.id,
			originalText: "ship it\ntoday",
		});
		expect(digestItems(saved.scene)).toEqual([
			{ kind: "note", author: "nora", text: "ship it\ntoday" },
		]);

		expect(changes.at(-1)?.cause).toEqual({ kind: "note", by: "nora", records: [note, label] });
		const digest = JSON.parse(await readFile(join(dir, "board.json"), "utf8"));
		expect(digest.items).toEqual([{ kind: "note", author: "nora", text: "ship it\ntoday" }]);
	});

	it("holds requests read before the first herdr snapshot until it names their author", async () => {
		const board = service();
		await board.receive([request({ op: "text", text: "Agenda" })]);
		board.updateSnapshot(OFFICE);
		const { scene } = await board.get();
		expect(live(scene).map((element) => [element.type, element.customData?.["author"]])).toEqual([
			["text", "nora"],
		]);
	});

	it("applies the rest of a batch when one request fails", async () => {
		let lookups = 0;
		const board = service({
			currentCompanyId: async () => {
				lookups += 1;
				if (lookups === 1) throw new Error("companies unreadable");
				return company;
			},
		});
		board.updateSnapshot(OFFICE);
		await expect(
			board.receive([request({ text: "lost" }), request({ text: "kept" })]),
		).resolves.toBeUndefined();
		expect(digestItems((await board.get()).scene ?? EMPTY_SCENE)).toEqual([
			{ kind: "note", author: "nora", text: "kept" },
		]);
	});

	it("round-trips the editor's scene, across a restart too", async () => {
		const board = await ready();
		await board.receive([request({}), request({ op: "text", text: "Agenda", x: 40, y: 900 })]);
		const loaded = await board.get();
		const scene = loaded.scene ?? EMPTY_SCENE;
		const saved = await board.put({ companyId: "acme", baseRevision: loaded.revision, scene });
		expect(saved).toMatchObject({ state: "saved", merged: false, board: { revision: 3 } });
		const restarted = await service().get();
		expect(restarted.revision).toBe(3);
		expect(restarted.scene?.elements).toEqual(scene.elements);
	});

	it("keeps a note posted after the editor last loaded, but not one the editor deleted", async () => {
		const board = await ready();
		await board.receive([request({ text: "late note" })]);
		const merged = await board.put({ companyId: "acme", baseRevision: 0, scene: EMPTY_SCENE });
		expect(merged.state === "saved" && merged.merged).toBe(true);
		const after = merged.board.scene ?? EMPTY_SCENE;
		expect(digestItems(after).map((item) => item.text)).toEqual(["late note"]);

		// Jeremy deletes it after seeing it: Excalidraw saves deletions as newer versions, which win.
		const gone = after.elements.map((element) => ({
			...element,
			isDeleted: true,
			version: element.version + 1,
		}));
		const deleted = await board.put({
			companyId: "acme",
			baseRevision: merged.board.revision,
			scene: { elements: gone },
		});
		expect(deleted.state === "saved" && deleted.merged).toBe(false);
		expect(live(deleted.board.scene)).toEqual([]);
	});

	it("lets only the chief clear, and refuses editor saves from before the clear", async () => {
		const board = await ready();
		await board.receive([request({})]);
		const before = await board.get();
		await board.receive([request({ op: "clear", text: undefined })]);
		expect(live((await board.get()).scene)).toHaveLength(2);

		await board.receive([request({ op: "clear", text: undefined, fromPane: "w1:p1" })]);
		const cleared = await board.get();
		expect(cleared.scene?.elements).toEqual([]);
		expect(changes.at(-1)?.cause).toEqual({ kind: "clear", by: "max" });
		const stale = await board.put({
			companyId: "acme",
			baseRevision: before.revision,
			scene: before.scene ?? EMPTY_SCENE,
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
		expect((await board.get()).scene).toBeNull();
		const misplaced = await board.put({
			companyId: "acme",
			baseRevision: acme.revision,
			scene: acme.scene ?? EMPTY_SCENE,
		});
		expect(misplaced).toMatchObject({ state: "rejected", reason: "the company changed" });
	});

	it("brings a tldraw board's notes and text across, keeping the old file aside", async () => {
		const richText = (text: string) => ({
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "text", text }] }],
		});
		const store = {
			"page:page": { id: "page:page", typeName: "page" },
			"shape:a": {
				id: "shape:a",
				typeName: "shape",
				type: "note",
				parentId: "page:page",
				index: "a1",
				x: 80,
				y: 80,
				props: { richText: richText("old idea"), color: "light-blue" },
				meta: { author: "ava" },
			},
			"shape:b": {
				id: "shape:b",
				typeName: "shape",
				type: "text",
				parentId: "page:page",
				index: "a2",
				x: 400,
				y: 40,
				props: { richText: richText("Q4") },
				meta: {},
			},
			"shape:c": {
				id: "shape:c",
				typeName: "shape",
				type: "draw",
				parentId: "page:page",
				index: "a3",
				x: 0,
				y: 0,
				props: {},
			},
		};
		await mkdir(join(dir, "whiteboards"), { recursive: true });
		const file = join(dir, "whiteboards", "acme.json");
		await writeFile(
			file,
			JSON.stringify({
				version: 1,
				companyId: "acme",
				revision: 7,
				snapshot: { store, schema: {} },
			}),
		);

		const loaded = await (await ready()).get();
		expect(loaded.revision).toBe(7);
		expect(digestItems(loaded.scene ?? EMPTY_SCENE)).toEqual([
			{ kind: "text", author: "jeremy", text: "Q4" },
			{ kind: "note", author: "ava", text: "old idea" },
		]);
		expect(live(loaded.scene)[0]).toMatchObject({ backgroundColor: "#a5d8ff", x: 80, y: 80 });
		expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ version: 2, revision: 7 });
		expect(
			(await readdir(join(dir, "whiteboards"))).some((name) =>
				name.startsWith("acme.json.tldraw-"),
			),
		).toBe(true);
	});
});
