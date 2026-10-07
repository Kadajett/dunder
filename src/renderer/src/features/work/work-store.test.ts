import type { WorkBoard, WorkBoardApi, WorkCard, WorkResult } from "@shared/work-board";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ADD_ERROR,
	connectWork,
	createCard,
	moveCard,
	setCardPriority,
	shownCards,
	useWork,
} from "./work-store";

function card(id: string, lane: WorkCard["lane"]): WorkCard {
	return {
		id,
		title: id,
		priority: 2,
		lane,
		assignee: null,
		epic: null,
		waitingOn: [],
		description: "",
		acceptance: "",
		updatedAt: "2026-10-01T00:00:00.000Z",
		spend: null,
		epicSpend: null,
	};
}

const board = (revision: number, ...cards: WorkCard[]): WorkBoard => ({
	state: "ok",
	revision,
	cards,
	asks: [],
});

/** A promise settled by the test, so in-flight writes can be observed. */
interface Deferred<T> {
	readonly promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => undefined;
	let reject: (error: unknown) => void = () => undefined;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

interface FakeApi {
	readonly api: WorkBoardApi;
	/** Every write call in order, each settled by the test. */
	readonly writes: Deferred<WorkResult>[];
	readonly read: Deferred<WorkBoard>;
	push(board: WorkBoard): void;
}

function fakeApi(): FakeApi {
	let listener: (board: WorkBoard) => void = () => undefined;
	const writes: Deferred<WorkResult>[] = [];
	const write = () => {
		const pending = deferred<WorkResult>();
		writes.push(pending);
		return pending.promise;
	};
	const read = deferred<WorkBoard>();
	const api: WorkBoardApi = {
		get: () => read.promise,
		onChanged: (next) => {
			listener = next;
			return () => undefined;
		},
		create: write,
		setPriority: write,
		move: write,
		assign: write,
		respond: write,
		dismiss: write,
	};
	return { api, writes, read, push: (next) => listener(next) };
}

/** What the bar shows, as `id:lane` in order. */
function shown(): string[] | undefined {
	const { board: current, edits } = useWork.getState();
	return shownCards(current, edits)?.map((each) => `${each.id}:${each.lane}`);
}

let fake: FakeApi;
let disconnect: () => void;

beforeEach(() => {
	fake = fakeApi();
	vi.stubGlobal("window", { office: { work: fake.api } });
	useWork.setState({ board: null, edits: [], creating: [], errors: {} });
	disconnect = connectWork();
});

afterEach(() => {
	disconnect();
	vi.unstubAllGlobals();
});

describe("work store", () => {
	it("keeps an optimistic move until bd fails, then reverts with an inline error", async () => {
		fake.push(board(1, card("o-1", "ready")));
		const moving = moveCard("o-1", "in_progress");
		expect(shown()).toEqual(["o-1:in_progress"]);
		fake.writes[0]?.resolve({ ok: false, reason: "bd exploded" });
		await moving;
		expect(shown()).toEqual(["o-1:ready"]);
		expect(useWork.getState().errors["o-1"]).toBe("Couldn't move it: bd exploded");
	});

	it("treats a rejected write as a failure", async () => {
		fake.push(board(1, card("o-1", "ready")));
		const changing = setCardPriority("o-1", 0);
		fake.writes[0]?.reject(new Error("ipc gone"));
		await changing;
		expect(useWork.getState().edits).toEqual([]);
		expect(useWork.getState().errors["o-1"]).toContain("ipc gone");
	});

	it("re-applies an in-flight edit over a board pushed meanwhile", () => {
		fake.push(board(1, card("o-1", "ready")));
		void moveCard("o-1", "done");
		fake.push(board(2, card("o-1", "ready"), card("o-2", "ready")));
		expect(shown()).toEqual(["o-2:ready", "o-1:done"]);
	});

	it("drops a confirmed move with the result, as main sends the board with it first: a later move by someone else shows", async () => {
		fake.push(board(1, card("o-1", "ready")));
		const moving = moveCard("o-1", "done");
		// Main's order: the refreshed board, then the write's result naming it.
		fake.push(board(2, card("o-1", "done")));
		fake.writes[0]?.resolve({ ok: true, revision: 2 });
		await moving;
		expect(useWork.getState().edits).toEqual([]);
		fake.push(board(3, card("o-1", "in_progress")));
		expect(shown()).toEqual(["o-1:in_progress"]);
	});

	it("keeps a confirmed edit until the board that has it arrives", async () => {
		fake.push(board(1, card("o-1", "ready")));
		const moving = moveCard("o-1", "done");
		fake.writes[0]?.resolve({ ok: true, revision: 2 });
		await moving;
		expect(shown()).toEqual(["o-1:done"]);
		fake.push(board(2, card("o-1", "done")));
		expect(useWork.getState().edits).toEqual([]);
	});

	it("skips writes for unknown cards and edits that change nothing", async () => {
		fake.push(board(1, card("o-1", "ready")));
		await moveCard("o-9", "done");
		await moveCard("o-1", "ready");
		expect(fake.writes).toHaveLength(0);
	});

	it("does not let the first read overwrite a fresher push", async () => {
		fake.push(board(2, card("o-2", "ready")));
		fake.read.resolve(board(1, card("o-1", "ready")));
		await fake.read.promise;
		expect(shown()).toEqual(["o-2:ready"]);
	});

	it("never shows a created ticket twice, and reports a failed create on the add row", async () => {
		fake.push(board(1));
		const ok = createCard("Ship it");
		expect(useWork.getState().creating.map((pending) => pending.value)).toEqual(["Ship it"]);
		fake.push(board(2, card("o-3", "ready")));
		fake.writes[0]?.resolve({ ok: true, revision: 2 });
		await ok;
		expect(useWork.getState().creating).toEqual([]);
		const failed = createCard("Nope");
		fake.writes[1]?.resolve({ ok: false, reason: "no bd" });
		await failed;
		expect(useWork.getState().creating).toEqual([]);
		expect(useWork.getState().errors[ADD_ERROR]).toBe("Couldn't add “Nope”: no bd");
	});
});
