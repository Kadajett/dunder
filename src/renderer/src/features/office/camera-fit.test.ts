import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { fitOrthographic, VIEW_DIRECTION } from "./camera-fit";

const box = (half: number): Vector3[] =>
	[-half, half].flatMap((x) =>
		[-half, half].flatMap((z) => [new Vector3(x, 0, z), new Vector3(x, 2, z)]),
	);

describe("fitOrthographic", () => {
	it("targets the centre of the points as seen from the view direction", () => {
		const shifted = box(5).map((point) => point.clone().add(new Vector3(10, 0, -4)));
		const { target } = fitOrthographic(shifted, { width: 1000, height: 700 });
		const centre = new Vector3(10, 1, -4);
		// The target may slide along the view axis, but not across it.
		const offset = target.clone().sub(centre);
		expect(
			offset
				.clone()
				.sub(VIEW_DIRECTION.clone().multiplyScalar(offset.dot(VIEW_DIRECTION)))
				.length(),
		).toBeLessThan(1e-6);
	});

	it("zooms in proportionally to the viewport and out for larger scenes", () => {
		const small = fitOrthographic(box(5), { width: 800, height: 800 });
		const wide = fitOrthographic(box(5), { width: 1600, height: 1600 });
		const big = fitOrthographic(box(10), { width: 800, height: 800 });
		expect(wide.zoom).toBeCloseTo(small.zoom * 2);
		expect(big.zoom).toBeLessThan(small.zoom);
	});

	it("is limited by the tighter viewport axis", () => {
		const tall = fitOrthographic(box(5), { width: 400, height: 4000 });
		const square = fitOrthographic(box(5), { width: 400, height: 400 });
		expect(tall.zoom).toBeCloseTo(square.zoom, 0);
	});
});
