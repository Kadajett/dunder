import type { WhiteboardBoard, WhiteboardChange } from "@shared/whiteboard";
import { atom } from "@tldraw/state";
import { Store } from "@tldraw/store";
import {
	createShapeId,
	createTLSchema,
	type TLPageId,
	type TLRecord,
	type TLStore,
	type TLStoreProps,
	toRichText,
} from "@tldraw/tlschema";
import { ZERO_INDEX_KEY } from "@tldraw/utils";
import { describe, expect, it } from "vitest";
import { mergeRecords, missingRecords, remoteStep } from "./board-sync";

const schema = createTLSchema();
const PROPS: TLStoreProps = {
	defaultName: "",
	assets: {
		upload: () => Promise.reject(new Error("no")),
		resolve: () => null,
		remove: async () => {},
	},
	users: { currentUser: atom("user", null), resolve: () => atom("user", null) },
	onMount: () => undefined,
};

/** A headless document with tldraw's default page, like the editor's (loading adds the page). */
function documentStore(): TLStore {
	const store = new Store({ schema, props: PROPS });
	store.loadStoreSnapshot({ store: {}, schema: schema.serialize() });
	return store;
}

function pageOf(store: TLStore): TLPageId {
	const page = store.allRecords().find((record) => record.typeName === "page");
	if (!page) throw new Error("no page");
	return page.id as TLPageId;
}

function note(store: TLStore, text: string, x: number): TLRecord {
	return schema.types.shape.create({
		id: createShapeId(),
		type: "note",
		parentId: pageOf(store),
		index: ZERO_INDEX_KEY,
		x,
		y: 0,
		props: {
			color: "yellow",
			richText: toRichText(text),
			size: "m",
			font: "sans",
			align: "middle",
			verticalAlign: "middle",
			labelColor: "black",
			growY: 0,
			fontSizeAdjustment: 1,
			url: "",
			scale: 1,
			textLastEditedBy: null,
		},
	});
}

const BOARD: WhiteboardBoard = { companyId: "acme", revision: 4, snapshot: null };

describe("mergeRecords", () => {
	it("adds an agent's note next to Jeremy's own edits, without counting it as his", () => {
		const store = documentStore();
		const mine = note(store, "Jeremy's idea", 0);
		store.put([mine]);
		const userEdits: unknown[] = [];
		store.listen((entry) => userEdits.push(entry), { source: "user", scope: "document" });
		const theirs = note(store, "nora: ship Friday", 300);
		mergeRecords(store, [theirs]);
		expect(store.get(mine.id)).toEqual(mine);
		expect(store.get(theirs.id)).toEqual(theirs);
		// Not echoed back to main as an edit of Jeremy's.
		expect(userEdits).toEqual([]);
	});
});

describe("missingRecords", () => {
	it("returns only the records the editor does not have yet", () => {
		const local = documentStore();
		const kept = note(local, "already here", 0);
		local.put([kept]);
		const main = documentStore();
		const posted = note(main, "posted while saving", 200);
		main.mergeRemoteChanges(() => main.put([...local.allRecords(), posted]));
		const missing = missingRecords(local, main.getStoreSnapshot("document"));
		expect(missing.map((record) => record.id)).toEqual([posted.id]);
		expect(missingRecords(local, null)).toEqual([]);
	});
});

describe("remoteStep", () => {
	const change = (cause: WhiteboardChange["cause"], companyId = "acme"): WhiteboardChange => ({
		board: { ...BOARD, companyId, revision: 5 },
		cause,
	});

	it("merges agents' posts, ignores its own saves, reloads a cleared or other board", () => {
		const records: TLRecord[] = [];
		expect(remoteStep(change({ kind: "note", by: "nora", records }), "acme")).toEqual({
			kind: "merge",
			records,
			revision: 5,
		});
		expect(remoteStep(change({ kind: "editor" }), "acme").kind).toBe("ignore");
		expect(remoteStep(change({ kind: "clear", by: "max" }), "acme").kind).toBe("reload");
		expect(remoteStep(change({ kind: "note", by: "nora", records }, "zeta"), "acme").kind).toBe(
			"reload",
		);
	});
});
