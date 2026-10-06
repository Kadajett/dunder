import type { Desk } from "@shared/layout/schema";
import { OrthographicCamera } from "three";
import { describe, expect, it } from "vitest";
import { screenPlacement } from "../scene/station";
import { applyPose, focusLookAt, focusPose, projectScreen } from "./camera-pose";
import { CHIEF_DOCK_RESERVE, focusArea } from "./focus-layout";

function cameraFor(size: { width: number; height: number }): OrthographicCamera {
	return new OrthographicCamera(
		-size.width / 2,
		size.width / 2,
		size.height / 2,
		-size.height / 2,
		0.1,
		100,
	);
}

const desk = (rotation: number): Desk => ({
	id: "d",
	position: { x: 3, z: -2 },
	rotation,
	reserved: false,
	chairColor: "#000",
});

describe("focusArea", () => {
	it("uses the whole viewport while the dock is closed", () => {
		expect(focusArea({ width: 1280, height: 800 }, false)).toEqual({
			left: 0,
			top: 0,
			width: 1280,
			height: 800,
		});
	});

	it("leaves the dock's strip free on the right while it is open", () => {
		expect(focusArea({ width: 1280, height: 800 }, true)).toEqual({
			left: 0,
			top: 0,
			width: 1280 - CHIEF_DOCK_RESERVE,
			height: 800,
		});
	});

	it("keeps the whole viewport when the free strip would be too narrow", () => {
		expect(focusArea({ width: 800, height: 600 }, true).width).toBe(800);
	});
});

describe("focused screen beside the open dock", () => {
	const sizes = [
		{ width: 1280, height: 800 },
		{ width: 1920, height: 1080 },
	];
	const rotations = [0, 90, 180, -45];
	const cases = sizes.flatMap((size) => rotations.map((rotation) => ({ size, rotation })));

	it.each(cases)(
		"$size.width×$size.height, desk at $rotation°: centred in the free area, clear of the dock",
		({ size, rotation }) => {
			const screen = screenPlacement(desk(rotation));
			const area = focusArea(size, true);
			const camera = cameraFor(size);
			applyPose(camera, focusPose(screen, size, area));
			const rect = projectScreen(screen, camera, size);
			expect(rect.left + rect.width / 2).toBeCloseTo(area.width / 2, 3);
			expect(rect.top + rect.height / 2).toBeCloseTo(size.height / 2, 3);
			expect(rect.left).toBeGreaterThanOrEqual(0);
			expect(rect.left + rect.width).toBeLessThanOrEqual(size.width - CHIEF_DOCK_RESERVE);
			expect(rect.width / rect.height).toBeCloseTo(screen.width / screen.height, 3);
		},
	);

	it("keeps the camera head-on when orbit controls re-aim it at focusLookAt", () => {
		const screen = screenPlacement(desk(90));
		const size = sizes[0] ?? { width: 1280, height: 800 };
		const pose = focusPose(screen, size, focusArea(size, true));
		const camera = cameraFor(size);
		applyPose(camera, pose);
		camera.lookAt(focusLookAt(pose));
		expect(camera.quaternion.angleTo(pose.quaternion)).toBeCloseTo(0, 6);
	});
});
