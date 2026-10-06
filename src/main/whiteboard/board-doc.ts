import {
	type BoardDigestItem,
	NOTE_COLORS,
	type NoteColor,
	type WhiteboardSnapshot,
} from "@shared/whiteboard";
import { atom } from "@tldraw/state";
import { Store } from "@tldraw/store";
import {
	createShapeId,
	createTLSchema,
	isShape,
	type TLPageId,
	type TLShape,
	type TLStore,
	type TLStoreProps,
	toRichText,
} from "@tldraw/tlschema";
import { getIndexAbove, sortByIndex, ZERO_INDEX_KEY } from "@tldraw/utils";
import { freeSpot, noteGrowY, pageBoxes, postSize } from "./board-geometry";
import { plainText } from "./rich-text";

/**
 * The board's tldraw document, headless in the main process. Only
 * `@tldraw/tlschema` + `@tldraw/store` run here (`@tldraw/editor` keeps Node
 * alive and needs a DOM). Records are validated and older snapshots migrated
 * by the schema, exactly as in the renderer's editor.
 */

const schema = createTLSchema();

/** Editor-only integrations; a headless store never uploads assets or resolves users. */
const HEADLESS_PROPS: TLStoreProps = {
	defaultName: "",
	assets: {
		upload: () => Promise.reject(new Error("the office whiteboard cannot upload assets")),
		resolve: () => null,
		remove: () => Promise.resolve(),
	},
	users: {
		currentUser: atom("whiteboard user", null),
		resolve: () => atom("whiteboard user", null),
	},
	onMount: () => undefined,
};

/** Shapes drawn in the editor carry no author: only Jeremy draws there. */
export const EDITOR_AUTHOR = "jeremy";

/**
 * A store holding `snapshot` (untrusted JSON from disk or the renderer), or a
 * fresh empty page when it is null. Loading migrates the snapshot to this
 * schema and validates every record, throwing on anything tldraw rejects; it
 * also adds the document and page records an empty board needs.
 */
export function openBoard(snapshot: unknown): TLStore {
	const store = new Store({ schema, props: HEADLESS_PROPS });
	const empty: WhiteboardSnapshot = { store: {}, schema: schema.serialize() };
	// The one unchecked step: tldraw's migration and record validation are the check.
	store.loadStoreSnapshot((snapshot ?? empty) as WhiteboardSnapshot);
	return store;
}

/** The document part (no session state), as the editor's `getSnapshot(store).document`. */
export function boardSnapshot(store: TLStore): WhiteboardSnapshot {
	return store.getStoreSnapshot("document");
}

function shapes(store: TLStore): TLShape[] {
	return store.allRecords().filter((record): record is TLShape => record.typeName === "shape");
}

function firstPage(store: TLStore): TLPageId {
	const pages = store.allRecords().filter((record) => record.typeName === "page");
	const page = pages.sort(sortByIndex)[0];
	if (!page) throw new Error("whiteboard has no page");
	return page.id;
}

export interface AgentPost {
	readonly kind: "note" | "text";
	readonly author: string;
	readonly text: string;
	readonly color?: NoteColor | undefined;
	readonly x?: number | undefined;
	readonly y?: number | undefined;
}

/** tldraw's NoteShapeUtil / TextShapeUtil defaults (5.5.2), but in the sans font: typed notes read better. */
function postProps(post: AgentPost): TLShape["props"] {
	const richText = toRichText(post.text);
	if (post.kind === "text") {
		return {
			color: "black",
			size: "m",
			w: 8,
			font: "sans",
			textAlign: "start",
			autoSize: true,
			scale: 1,
			richText,
		};
	}
	return {
		color: NOTE_COLORS[post.color ?? "yellow"],
		richText,
		size: "m",
		font: "sans",
		align: "middle",
		verticalAlign: "middle",
		labelColor: "black",
		growY: noteGrowY(post.text),
		fontSizeAdjustment: 1,
		url: "",
		scale: 1,
		textLastEditedBy: null,
	};
}

/** Add an agent's sticky note or text on top of everything, signed in `meta.author`. */
export function addPost(store: TLStore, post: AgentPost): TLShape {
	const parentId = firstPage(store);
	const top = shapes(store)
		.filter((shape) => shape.parentId === parentId)
		.map((shape) => shape.index)
		.sort()
		.at(-1);
	const spot =
		post.x !== undefined && post.y !== undefined
			? post
			: freeSpot(pageBoxes(shapes(store), parentId), postSize(post.kind, post.text));
	const record = schema.types.shape.create({
		id: createShapeId(),
		type: post.kind,
		parentId,
		index: getIndexAbove(top ?? ZERO_INDEX_KEY),
		x: spot.x ?? 0,
		y: spot.y ?? 0,
		props: postProps(post),
		meta: { author: post.author },
	});
	if (!isShape(record)) throw new Error("the shape record type made something else");
	store.put([record]);
	return record;
}

/** Remove every shape (and the bindings and assets that hang off them). */
export function clearBoard(store: TLStore): void {
	const doomed = store
		.allRecords()
		.filter((record) => ["shape", "binding", "asset"].includes(record.typeName))
		.map((record) => record.id);
	store.remove(doomed);
}

/**
 * Keep agents' shapes the editor's snapshot does not have yet (posted after
 * the editor last loaded); returns how many were put back.
 */
export function keepPosts(store: TLStore, posts: readonly TLShape[]): number {
	const missing = posts.filter((shape) => !store.has(shape.id));
	store.put(missing);
	return missing.length;
}

/** Notes and text on the board, top-left first, for `office-board read`. */
export function digestItems(store: TLStore): BoardDigestItem[] {
	return shapes(store)
		.filter((shape) => shape.type === "note" || shape.type === "text")
		.sort((a, b) => a.y - b.y || a.x - b.x)
		.map((shape) => {
			const author = shape.meta["author"];
			const richText = "richText" in shape.props ? shape.props.richText : undefined;
			return {
				kind: shape.type === "note" ? "note" : "text",
				author: typeof author === "string" ? author : EDITOR_AUTHOR,
				text: plainText(richText).trim(),
			} satisfies BoardDigestItem;
		})
		.filter((item) => item.text.length > 0);
}
