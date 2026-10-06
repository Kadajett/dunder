import type { Vec2 } from "@shared/layout/schema";
import { describe, expect, it } from "vitest";
import type { Placement } from "../scene/station";
import { type Brain, type BrainWorld, initialBrain, stepBrain, TIMING } from "./brain";

const seat: Placement = { position: { x: 0, z: 0 }, rotationY: 0 };
const cooler: Placement = { position: { x: 5, z: 5 }, rotationY: 0 };

function world(overrides: Partial<BrainWorld> = {}): BrainWorld {
	return {
		seat,
		pickSpot: () => cooler,
		route: (from: Vec2, to: Vec2) => [from, to],
		random: () => 0.5,
		...overrides,
	};
}

const tick = (
	status: "idle" | "working" | "blocked" | "done",
	now: number,
	position: Vec2 = seat.position,
) => ({ type: "tick", status, now, position }) as const;

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
