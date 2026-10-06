import { JEREMY } from "@shared/pool";
import { describe, expect, it } from "vitest";
import {
	arrange,
	ELIGIBLE_AFTER_MS,
	joinJeremy,
	type Lounge,
	leaveJeremy,
	newLounge,
	nextChangeAt,
	observe,
	type Presence,
	seated,
	WINNER_PAUSE_MS,
	withGame,
} from "./lounge";

const free = (...names: string[]): Presence[] => names.map((name) => ({ name, free: true }));
const busy = (...names: string[]): Presence[] => names.map((name) => ({ name, free: false }));

/** Everyone listed has been idle since t=0; returns the table at t=60 s. */
function idleFor(names: readonly string[], seed = 1): Lounge {
	const start = observe(newLounge(seed), free(...names), 0);
	return observe(start, free(...names), ELIGIBLE_AFTER_MS);
}

const sideSizes = (lounge: Lounge): number[] =>
	lounge.game?.sides.map((side) => side.players.length) ?? [];

describe("idle mode: forming games", () => {
	it("waits 60 s of idle before anyone walks over", () => {
		const start = observe(newLounge(1), free("theo", "mika"), 0);
		expect(observe(start, free("theo", "mika"), ELIGIBLE_AFTER_MS - 1).stage).toBe("resting");
		const formed = observe(start, free("theo", "mika"), ELIGIBLE_AFTER_MS);
		expect(formed).toMatchObject({ stage: "playing", game: { mode: "game" } });
		expect(seated(formed).sort()).toEqual(["mika", "theo"]);
	});

	it("restarts the 60 s when an agent gets busy in between", () => {
		let lounge = observe(newLounge(1), free("theo", "mika"), 0);
		lounge = observe(lounge, [...free("theo"), ...busy("mika")], 30_000);
		lounge = observe(lounge, free("theo", "mika"), 31_000);
		// Only theo has a full minute: he practises; mika joins once her own minute is up.
		expect(seated(observe(lounge, free("theo", "mika"), ELIGIBLE_AFTER_MS))).toEqual(["theo"]);
		const later = observe(lounge, free("theo", "mika"), 31_000 + ELIGIBLE_AFTER_MS);
		expect(later.game?.mode).toBe("game");
	});

	it("gives a lone idle agent practice", () => {
		const lounge = idleFor(["nora"]);
		expect(lounge.game).toMatchObject({ mode: "practice", sides: [{ players: ["nora"] }] });
	});

	it.each([
		[2, [1, 1], 0],
		[3, [1, 1], 1],
		[4, [2, 2], 0],
		[5, [2, 2], 1],
		[6, [3, 3], 0],
		[8, [3, 3], 2],
	])("seats %i idle agents as %j with %i queued, and keeps it that way", (count, sizes, queued) => {
		const names = ["a", "b", "c", "d", "e", "f", "g", "h"].slice(0, count);
		const formed = idleFor(names);
		const later = observe(formed, free(...names), ELIGIBLE_AFTER_MS + 30_000);
		for (const lounge of [formed, later]) {
			expect(sideSizes(lounge)).toEqual(sizes);
			expect(lounge.queue).toHaveLength(queued);
		}
	});

	it("turns practice into a game when a second agent becomes eligible", () => {
		let lounge = idleFor(["nora"]);
		lounge = observe(lounge, free("nora", "ben"), ELIGIBLE_AFTER_MS + 1_000);
		lounge = observe(lounge, free("nora", "ben"), 2 * ELIGIBLE_AFTER_MS + 1_000);
		expect(lounge.game?.mode).toBe("game");
		expect(seated(lounge).sort()).toEqual(["ben", "nora"]);
	});

	it("seats newcomers mid-game only in pairs or into a short side; the rest queue", () => {
		let lounge = idleFor(["a", "b", "c"]);
		const [waiting] = lounge.queue;
		lounge = observe(lounge, free("a", "b", "c", "d"), ELIGIBLE_AFTER_MS + 1_000);
		lounge = observe(lounge, free("a", "b", "c", "d"), 2 * ELIGIBLE_AFTER_MS + 1_000);
		expect(sideSizes(lounge)).toEqual([2, 2]);
		expect(seated(lounge)).toContain(waiting);

		const three = idleFor(["a", "b", "c", "d", "e"]);
		const [queued] = three.queue;
		const leaver = three.game?.sides[1]?.players[0] ?? "";
		const stay = ["a", "b", "c", "d", "e"].filter((name) => name !== leaver);
		const refilled = observe(three, [...free(...stay), ...busy(leaver)], ELIGIBLE_AFTER_MS + 1_000);
		expect(sideSizes(refilled)).toEqual([2, 2]);
		expect(seated(refilled)).toContain(queued);

		const full = idleFor(["a", "b", "c", "d", "e", "f"]);
		const later = observe(
			observe(full, free("a", "b", "c", "d", "e", "f", "g"), 61_000),
			free("a", "b", "c", "d", "e", "f", "g"),
			130_000,
		);
		expect(sideSizes(later)).toEqual([3, 3]);
		expect(later.queue).toEqual(["g"]);
	});

	it("knows when the clock next matters: an agent's minute, the end of the winner pause", () => {
		const lounge = observe(newLounge(1), free("theo"), 1_000);
		expect(nextChangeAt(lounge, 2_000)).toBe(1_000 + ELIGIBLE_AFTER_MS);
		const practising = observe(lounge, free("theo"), 1_000 + ELIGIBLE_AFTER_MS);
		expect(nextChangeAt(practising, 1_000 + ELIGIBLE_AFTER_MS)).toBeNull();
		const game = idleFor(["a", "b"]).game;
		if (!game) throw new Error("no game");
		const ended = withGame(
			idleFor(["a", "b"]),
			{ ...game, result: { winner: 0, reason: "test" } },
			70_000,
		);
		expect(nextChangeAt(ended, 70_000)).toBe(70_000 + WINNER_PAUSE_MS);
	});
});

describe("idle mode: leaving", () => {
	it("sends a busy agent back at once; its side plays on", () => {
		const lounge = idleFor(["a", "b", "c", "d"]);
		const leaver = lounge.game?.sides[0]?.players[0] ?? "";
		const stay = ["a", "b", "c", "d"].filter((name) => name !== leaver);
		const after = observe(lounge, [...free(...stay), ...busy(leaver)], ELIGIBLE_AFTER_MS + 500);
		expect(after.stage).toBe("playing");
		expect(seated(after)).not.toContain(leaver);
		expect(sideSizes(after)).toEqual([1, 2]);
	});

	it("forfeits an emptied side, shows the winner for 5 s, then re-forms with the queued agent first", () => {
		const lounge = idleFor(["a", "b", "c"]);
		const [queued] = lounge.queue;
		const leaver = lounge.game?.sides[1]?.players[0] ?? "";
		const winner = lounge.game?.sides[0]?.players[0] ?? "";
		const stay = ["a", "b", "c"].filter((name) => name !== leaver);
		const now = ELIGIBLE_AFTER_MS + 1_000;
		const finished = observe(lounge, [...free(...stay), ...busy(leaver)], now);
		expect(finished).toMatchObject({ stage: "finished", game: { result: { winner: 0 } } });
		expect(observe(finished, free(...stay), now + WINNER_PAUSE_MS - 1).stage).toBe("finished");
		const next = observe(finished, free(...stay), now + WINNER_PAUSE_MS);
		expect(next.stage).toBe("playing");
		expect(seated(next).sort()).toEqual([queued, winner].sort());
	});

	it("rests the table, balls as they lie, when nobody is left", () => {
		const lounge = idleFor(["nora"]);
		const after = observe(lounge, busy("nora"), ELIGIBLE_AFTER_MS + 1);
		expect(after.stage).toBe("resting");
		expect(after.balls).toEqual(lounge.game?.balls);
	});

	it("lets the losing side's players break the next game", () => {
		const lounge = idleFor(["a", "b"]);
		const game = lounge.game;
		if (!game) throw new Error("no game");
		const ended = withGame(lounge, { ...game, result: { winner: 0, reason: "test" } }, 70_000);
		const loser = game.sides[1]?.players[0] ?? "";
		const next = arrange(ended, 70_000 + WINNER_PAUSE_MS);
		const breaking = next.game?.sides[next.game.turn]?.players;
		expect(breaking).toContain(loser);
	});
});

describe("Jeremy", () => {
	it("practises alone on a resting table; agents who turn up wait for him", () => {
		let lounge = joinJeremy(newLounge(1), 0);
		expect(lounge.game).toMatchObject({ mode: "practice", sides: [{ players: [JEREMY] }] });
		lounge = observe(observe(lounge, free("theo"), 1), free("theo"), ELIGIBLE_AFTER_MS + 1);
		expect(lounge.game?.mode).toBe("practice");
		expect(lounge.queue).toEqual(["theo"]);
		const after = leaveJeremy(lounge, ELIGIBLE_AFTER_MS + 2);
		expect(after.game).toMatchObject({ mode: "practice", sides: [{ players: ["theo"] }] });
	});

	it("joins the smaller side of a running game, and his leaving forfeits a side he emptied", () => {
		const lounge = idleFor(["a", "b", "c"]);
		const joined = joinJeremy(lounge, ELIGIBLE_AFTER_MS + 1);
		expect(sideSizes(joined)).toEqual([2, 1]);
		const solo = joinJeremy(idleFor(["a"]), ELIGIBLE_AFTER_MS + 1);
		expect(solo.game?.mode).toBe("game");
		expect(seated(solo).sort()).toEqual([JEREMY, "a"].sort());
		const jeremySide = solo.game?.sides.findIndex((side) => side.players.includes(JEREMY)) ?? -1;
		const left = leaveJeremy(solo, ELIGIBLE_AFTER_MS + 2);
		expect(left).toMatchObject({ stage: "finished", game: { result: { winner: 1 - jeremySide } } });
	});

	it("is never seated as an agent, even if one is named like him", () => {
		const lounge = idleFor([JEREMY]);
		expect(lounge.stage).toBe("resting");
	});
});
