import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import type {
	BoardRequestLine,
	WhiteboardBoard,
	WhiteboardCause,
	WhiteboardChange,
	WhiteboardPutRequest,
	WhiteboardPutResult,
} from "@shared/whiteboard";
import type { TLShape, TLStore } from "@tldraw/tlschema";
import { addPost, boardSnapshot, clearBoard, digestItems, keepPosts, openBoard } from "./board-doc";
import { boardPath, loadBoard, saveBoard, saveDigest, setAside } from "./board-file";
import { parseBoardRequests } from "./requests";

const log = createLogger("whiteboard");

/** Agent posts remembered for merging into editor saves that predate them. */
const POSTS_KEPT = 200;

export interface WhiteboardDeps {
	/** `<userData>/whiteboards`: one board file per company. */
	readonly dir: string;
	/** Where `office-board read` finds the board as text. */
	readonly digestPath: string;
	readonly currentCompanyId: () => Promise<string>;
	/** Live name of the Chief of Staff (the only agent allowed to clear the board). */
	readonly chiefName: () => string | undefined;
	readonly emit: (change: WhiteboardChange) => void;
	readonly now?: () => Date;
}

interface OpenBoard {
	readonly companyId: string;
	revision: number;
	readonly store: TLStore;
	/** Agent posts by the revision they arrived at, newest last. */
	posts: { readonly revision: number; readonly shape: TLShape }[];
	/** Revision of the last clear: editor saves from before it are refused. */
	clearedAt: number;
}

/** Run tasks one at a time, in call order; a failure does not block later tasks. */
function serializer(): <T>(task: () => Promise<T>) => Promise<T> {
	let tail: Promise<unknown> = Promise.resolve();
	return (task) => {
		const run = tail.then(task);
		tail = run.catch(() => undefined);
		return run;
	};
}

/**
 * The current company's whiteboard, owned by main: Jeremy's editor saves whole
 * documents, agents' `office-board` requests add notes and text on top, and
 * every accepted change is persisted, summarised for `office-board read` and
 * broadcast.
 */
export class WhiteboardService {
	readonly #deps: WhiteboardDeps;
	readonly #serial = serializer();
	#board: OpenBoard | undefined;
	#snapshot: SessionSnapshot | undefined;
	/** Requests read before the first herdr snapshot: their authors come from it. */
	#early: string[] = [];

	constructor(deps: WhiteboardDeps) {
		this.#deps = deps;
	}

	get(): Promise<WhiteboardBoard> {
		return this.#serial(async () => this.#view(await this.#current()));
	}

	/** `snapshot` is unchecked renderer JSON; tldraw's schema validates it (and throws on bad records). */
	put(
		request: Omit<WhiteboardPutRequest, "snapshot"> & { readonly snapshot: unknown },
	): Promise<WhiteboardPutResult> {
		return this.#serial(async () => {
			const board = await this.#current();
			if (request.companyId !== board.companyId)
				return { state: "rejected", reason: "the company changed", board: this.#view(board) };
			if (request.baseRevision < board.clearedAt)
				return { state: "rejected", reason: "the board was cleared", board: this.#view(board) };
			// Throws on records the schema rejects; the old document stays.
			const store = openBoard(request.snapshot);
			const newer = board.posts.filter((post) => post.revision > request.baseRevision);
			const merged = keepPosts(
				store,
				newer.map((post) => post.shape),
			);
			const next = { ...board, store, revision: board.revision + 1 };
			this.#board = next;
			await this.#commit(next, { kind: "editor" });
			return { state: "saved", board: this.#view(next), merged: merged > 0 };
		});
	}

	/** The current company changed (or was saved): switch boards when it is another one. */
	companyChanged(companyId: string): Promise<void> {
		return this.#serial(async () => {
			if (this.#board?.companyId === companyId) return;
			const board = await this.#open(companyId);
			await this.#publish(board, { kind: "company" });
		});
	}

	updateSnapshot(snapshot: SessionSnapshot): void {
		this.#snapshot = snapshot;
		if (this.#early.length === 0) return;
		const early = this.#early;
		this.#early = [];
		void this.receive(early);
	}

	/** New lines from the board-requests file. */
	receive(lines: readonly string[]): Promise<void> {
		if (!this.#snapshot) {
			this.#early.push(...lines);
			return Promise.resolve();
		}
		const requests = parseBoardRequests(lines);
		return this.#serial(async () => {
			for (const request of requests) await this.#apply(request);
		});
	}

	async #apply(request: BoardRequestLine): Promise<void> {
		const board = await this.#current();
		const by =
			this.#snapshot?.agents.find((agent) => agent.pane_id === request.fromPane)?.name ?? "someone";
		if (request.op === "clear") {
			if (by !== this.#deps.chiefName()) {
				log.warn("board clear refused: only the chief of staff clears the board", { by });
				return;
			}
			clearBoard(board.store);
			board.revision += 1;
			board.clearedAt = board.revision;
			board.posts = [];
			await this.#commit(board, { kind: "clear", by });
			return;
		}
		const shape = addPost(board.store, {
			kind: request.op,
			author: by,
			text: request.text,
			color: request.color,
			x: request.x,
			y: request.y,
		});
		board.revision += 1;
		board.posts = [...board.posts, { revision: board.revision, shape }].slice(-POSTS_KEPT);
		await this.#commit(board, { kind: request.op, by, records: [shape] });
	}

	async #current(): Promise<OpenBoard> {
		const companyId = await this.#deps.currentCompanyId();
		if (this.#board?.companyId === companyId) return this.#board;
		const board = await this.#open(companyId);
		await this.#writeDigest(board);
		return board;
	}

	/** Persist, then publish: a broadcast never announces a board that is not on disk. */
	async #commit(board: OpenBoard, cause: WhiteboardCause): Promise<void> {
		const view = this.#view(board);
		await saveBoard(boardPath(this.#deps.dir, board.companyId), board.companyId, view);
		await this.#publish(board, cause);
	}

	async #publish(board: OpenBoard, cause: WhiteboardCause): Promise<void> {
		this.#deps.emit({ board: this.#view(board), cause });
		await this.#writeDigest(board);
	}

	async #open(companyId: string): Promise<OpenBoard> {
		const path = boardPath(this.#deps.dir, companyId);
		let saved = await loadBoard(path, this.#now());
		let store: TLStore;
		try {
			store = openBoard(saved.snapshot);
		} catch (error) {
			// A document this tldraw cannot read: keep it aside rather than overwrite it.
			log.warn("saved board does not load", { companyId, error });
			await setAside(path, this.#now());
			saved = { revision: 0, snapshot: null };
			store = openBoard(null);
		}
		this.#board = { companyId, revision: saved.revision, store, posts: [], clearedAt: 0 };
		return this.#board;
	}

	async #writeDigest(board: OpenBoard): Promise<void> {
		const digest = {
			companyId: board.companyId,
			revision: board.revision,
			updatedAt: this.#now().toISOString(),
			items: digestItems(board.store),
		};
		// Only `office-board read` suffers if this fails; the board itself is saved.
		await saveDigest(this.#deps.digestPath, digest).catch((error: unknown) =>
			log.warn("cannot write the board digest", { error }),
		);
	}

	#view(board: OpenBoard): WhiteboardBoard {
		const snapshot = board.revision === 0 ? null : boardSnapshot(board.store);
		return { companyId: board.companyId, revision: board.revision, snapshot };
	}

	#now(): Date {
		return this.#deps.now?.() ?? new Date();
	}
}
