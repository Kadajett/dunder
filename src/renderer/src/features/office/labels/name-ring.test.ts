import { describe, expect, it } from "vitest";
import { layoutArc } from "./name-ring";

describe("layoutArc", () => {
	it("centres the name on the arc nearest the camera, reading left to right", () => {
		const { angles, scale } = layoutArc([40, 30, 30, 40], 200);
		expect(scale).toBe(1);
		// Canvas angles grow clockwise from +x; π/2 is the near point, larger is further left.
		expect(angles).toEqual([...angles].sort((a, b) => b - a));
		const first = angles[0] ?? 0;
		const last = angles.at(-1) ?? 0;
		expect((first + last) / 2).toBeCloseTo(Math.PI / 2);
	});

	it("shrinks a long name so it never wraps more than 1.2π around the ring", () => {
		const { scale, halfSweep } = layoutArc(Array(40).fill(50), 200);
		expect(scale).toBeLessThan(1);
		expect(halfSweep * 2).toBeCloseTo(Math.PI * 1.2);
	});
});
