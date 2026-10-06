import type { Vec2 } from "@shared/layout/schema";
import { describe, expect, it } from "vitest";
import type { Placement } from "../scene/station";
import {
	type Brain,
	type BrainWorld,
	initialBrain,
	stepBrain,
	TIMING,
	type WorkoutWindow,
} from "./brain";
import { FACE_CAMERA } from "./workout-spots";

const seat: Placement = { position: { x: 0, z: 0 }, rotationY: 0 };
const cooler: Placement = { position: { x: 5, z: 5 }, rotationY: 0 };
const gym: Placement = { position: { x: -4, z: 3 }, rotationY: FACE_CAMERA };
const besideDesk: Placement = { position: { x: 1, z: 0 }, rotationY: FACE_CAMERA };
const byTheBoard: Placement = { position: { x: -10, z: 6 }, rotationY: -Math.PI / 2 };

function world(overrides: Partial<BrainWorld> = {}): BrainWorld {
	return {
		seat,
		workoutSpots: [gym, besideDesk],
		meetingSpots: [byTheBoard, besideDesk],
		pickSpot: () => cooler,
		route: (from: Vec2, to: Vec2) => [from, to],
		random: () => 0.5,
		colleagueSpot: () => undefined,
		...overrides,
	};
}

const tick = (
	status: "idle" | "working" | "blocked" | "done",
	now: number,
	position: Vec2 = seat.position,
	workout: WorkoutWindow | undefined = undefined,
) => ({ type: "tick", status, now, position, workout }) as const;

const workout: WorkoutWindow = { start: 100, end: 170 };

describe("agent behaviour", () => {
	it("stays seated while working, even past its outing time", () => {
		const brain = initialBrain(0, () => 0);
		const later = stepBrain(brain, tick("working", 1_000), world());
		expect(later.mode).toBe("seated");
	});

	it("walks to a spot once idle long enough, then lingers there", () => {
		const brain = initialBrain(0, () => 0);
		expect(stepBrain(brain, tick("idle", TIMING.firstOuting[0] - 1), world()).mode).toBe("seated");
		const walking = stepBrain(brain, tick("idle", TIMING.firstOuting[0] + 1), world());
		expect(walking).toMatchObject({ mode: "walking", purpose: "outing", goal: cooler });
		const hanging = stepBrain(walking, { type: "arrived", now: 20 }, world());
		expect(hanging.mode).toBe("hanging");
	});

	it("heads straight back to the desk when work arrives mid-walk", () => {
		const walking: Brain = {
			mode: "walking",
			purpose: "outing",
			path: [seat.position, cooler.position],
			goal: cooler,
		};
		const here = { x: 2, z: 2 };
		const back = stepBrain(walking, tick("working", 30, here), world());
		expect(back).toMatchObject({ mode: "walking", purpose: "return", goal: seat });
		if (back.mode === "walking") expect(back.path[0]).toEqual(here);
		expect(stepBrain(back, { type: "arrived", now: 33 }, world()).mode).toBe("seated");
	});

	it("returns from a spot when the linger time is over or the agent gets blocked", () => {
		const hanging: Brain = { mode: "hanging", at: cooler, until: 50 };
		expect(stepBrain(hanging, tick("idle", 49, cooler.position), world()).mode).toBe("hanging");
		expect(stepBrain(hanging, tick("idle", 50, cooler.position), world())).toMatchObject({
			purpose: "return",
		});
		expect(stepBrain(hanging, tick("blocked", 40, cooler.position), world())).toMatchObject({
			purpose: "return",
		});
	});

	it("stays put when there is nowhere to go", () => {
		const brain = initialBrain(0, () => 0);
		const next = stepBrain(brain, tick("idle", 100), world({ route: () => undefined }));
		expect(next.mode).toBe("seated");
		if (next.mode === "seated") expect(next.nextOutingAt).toBeGreaterThan(100);
	});
});

describe("workout", () => {
	it("gets a working agent up and walking to its spot when the workout starts", () => {
		const seated = initialBrain(0, () => 0);
		expect(stepBrain(seated, tick("working", 99, seat.position, workout), world()).mode).toBe(
			"seated",
		);
		const walking = stepBrain(seated, tick("working", 100, seat.position, workout), world());
		expect(walking).toMatchObject({ mode: "walking", purpose: "workout", goal: gym });
		const exercising = stepBrain(walking, { type: "arrived", now: 110 }, world());
		expect(exercising).toEqual({ mode: "exercising", at: gym });
	});

	it("keeps exercising whatever the agent's status until the routine ends", () => {
		const exercising: Brain = { mode: "exercising", at: gym };
		const busy = stepBrain(exercising, tick("blocked", 150, gym.position, workout), world());
		expect(busy).toBe(exercising);
		const done = stepBrain(exercising, tick("idle", 170, gym.position, workout), world());
		expect(done).toMatchObject({ mode: "walking", purpose: "return", goal: seat });
		expect(stepBrain(done, { type: "arrived", now: 180 }, world()).mode).toBe("seated");
	});

	it("pulls a wandering agent out of its outing into the workout", () => {
		const hanging: Brain = { mode: "hanging", at: cooler, until: 500 };
		const next = stepBrain(hanging, tick("idle", 120, cooler.position, workout), world());
		expect(next).toMatchObject({ purpose: "workout", path: [cooler.position, gym.position] });
	});

	it("exercises beside the desk when the group spot is out of reach", () => {
		const route = (from: Vec2, to: Vec2) => (to === gym.position ? undefined : [from, to]);
		const next = stepBrain(
			initialBrain(0, () => 0),
			tick("idle", 100, seat.position, workout),
			{
				...world(),
				route,
			},
		);
		expect(next).toMatchObject({ mode: "walking", purpose: "workout", goal: besideDesk });
	});

	it("exercises on the spot, facing the camera, when it cannot walk anywhere", () => {
		const here = { x: 2, z: 2 };
		const next = stepBrain(
			initialBrain(0, () => 0),
			tick("idle", 100, here, workout),
			world({ route: () => undefined }),
		);
		expect(next).toEqual({ mode: "exercising", at: { position: here, rotationY: FACE_CAMERA } });
	});

	it("abandons the walk to the spot when the workout is called off", () => {
		const walking: Brain = {
			mode: "walking",
			purpose: "workout",
			path: [seat.position, gym.position],
			goal: gym,
		};
		const here = { x: -2, z: 1 };
		expect(stepBrain(walking, tick("idle", 120, here), world())).toMatchObject({
			purpose: "return",
			path: [here, seat.position],
		});
	});
});

describe("visiting a colleague to deliver a message", () => {
	const desk: Placement = { position: { x: 6, z: -2 }, rotationY: Math.PI / 2 };
	const visit = { id: "msg-1", at: desk, until: 40 };
	const visitTick = (status: "idle" | "working", now: number, position: Vec2 = seat.position) =>
		({ ...tick(status, now, position), visit }) as const;

	it("gets up even while working, chats until the visit ends, then goes back", () => {
		const seated = initialBrain(0, () => 0.9);
		const walking = stepBrain(seated, visitTick("working", 10), world());
		expect(walking).toMatchObject({ mode: "walking", purpose: "visit", goal: desk });
		const chatting = stepBrain(walking, { type: "arrived", now: 18 }, world());
		expect(chatting).toMatchObject({ mode: "hanging", until: 40 });
		// A busy status does not cut the chat short…
		expect(stepBrain(chatting, visitTick("working", 30, desk.position), world())).toBe(chatting);
		// …the end of the visit does.
		expect(stepBrain(chatting, visitTick("working", 40, desk.position), world())).toMatchObject({
			mode: "walking",
			purpose: "return",
		});
	});

	it("does not start the same visit twice", () => {
		const walking = stepBrain(
			initialBrain(0, () => 0.9),
			visitTick("idle", 10),
			world(),
		);
		expect(stepBrain(walking, visitTick("idle", 11, { x: 3, z: -1 }), world())).toBe(walking);
	});

	it("lets a workout take over a visit", () => {
		const walking = stepBrain(
			initialBrain(0, () => 0.9),
			visitTick("idle", 110),
			world(),
		);
		const during = stepBrain(walking, { ...visitTick("idle", 111), workout }, world());
		expect(during).toMatchObject({ mode: "walking", purpose: "workout" });
	});
});

describe("gathering for a brainstorm", () => {
	const meeting = (status: "idle" | "working", now: number, position: Vec2 = seat.position) =>
		({ ...tick(status, now, position), meeting: true }) as const;

	it("walks to the board even while working, stands there, and goes back when it ends", () => {
		const walking = stepBrain(
			initialBrain(0, () => 0),
			meeting("working", 5),
			world(),
		);
		expect(walking).toMatchObject({ mode: "walking", purpose: "meeting", goal: byTheBoard });
		const standing = stepBrain(walking, { type: "arrived", now: 9 }, world());
		expect(standing).toEqual({ mode: "meeting", at: byTheBoard });
		// Work arriving does not send it back mid-brainstorm…
		expect(stepBrain(standing, meeting("working", 30, byTheBoard.position), world())).toBe(
			standing,
		);
		// …the end of the brainstorm does.
		expect(stepBrain(standing, tick("working", 40, byTheBoard.position), world())).toMatchObject({
			mode: "walking",
			purpose: "return",
		});
	});

	it("drops everything for a workout, then goes straight back to the board", () => {
		const standing: Brain = { mode: "meeting", at: byTheBoard };
		const during = { ...meeting("idle", 110, byTheBoard.position), workout };
		expect(stepBrain(standing, during, world())).toMatchObject({
			mode: "walking",
			purpose: "workout",
		});
		const exercising: Brain = { mode: "exercising", at: gym };
		const after = { ...meeting("idle", 180, gym.position), workout };
		expect(stepBrain(exercising, after, world())).toMatchObject({
			purpose: "meeting",
			goal: byTheBoard,
		});
		expect(
			stepBrain(exercising, { ...tick("idle", 180, gym.position), workout }, world()),
		).toMatchObject({
			purpose: "return",
		});
	});
});
