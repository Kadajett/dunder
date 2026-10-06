import type { Desk } from "@shared/layout/schema";
import { OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { screenPlacement } from "../scene/station";
import { applyPose, easeInOutCubic, focusPose, lerpPose, projectScreen } from "./camera-pose";

const viewport = { width: 1600, height: 1000 };

/** R3F frames orthographic cameras in CSS pixels; zoom scales world units to pixels. */
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

describe("focus camera", () => {
	it.each([0, 90, 180, -45])(
		"frames a desk rotated %i° head-on, centred, filling 70%%",
		(rotation) => {
			const screen = screenPlacement(desk(rotation));
			const camera = cameraFor(viewport);
			applyPose(camera, focusPose(screen, viewport));
			const rect = projectScreen(screen, camera, viewport);
			expect(rect.left + rect.width / 2).toBeCloseTo(viewport.width / 2, 3);
			expect(rect.top + rect.height / 2).toBeCloseTo(viewport.height / 2, 3);
			const fills = [rect.width / viewport.width, rect.height / viewport.height];
			expect(Math.max(...fills)).toBeCloseTo(0.7, 3);
			// Head-on: the projected rectangle keeps the screen's aspect ratio.
			expect(rect.width / rect.height).toBeCloseTo(screen.width / screen.height, 3);
		},
	);

	it("looks along the screen normal and clips what sits in front of the screen", () => {
		const screen = screenPlacement(desk(90));
		const pose = focusPose(screen, viewport);
		const forward = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
		expect(forward.x).toBeCloseTo(-screen.normal.x, 6);
		expect(forward.z).toBeCloseTo(-screen.normal.z, 6);
		const centre = new Vector3(screen.center.x, screen.center.y, screen.center.z);
		const distance = pose.position.distanceTo(centre);
		expect(distance - pose.near).toBeLessThan(1);
		expect(distance - pose.near).toBeGreaterThan(0);
	});

	it("interpolates from start to end with geometric zoom", () => {
		const a = focusPose(screenPlacement(desk(0)), viewport);
		const b = { ...a, zoom: a.zoom * 4, position: a.position.clone().add(new Vector3(10, 0, 0)) };
		expect(lerpPose(a, b, 0).zoom).toBeCloseTo(a.zoom);
		expect(lerpPose(a, b, 1).position.distanceTo(b.position)).toBeCloseTo(0);
		expect(lerpPose(a, b, 0.5).zoom).toBeCloseTo(a.zoom * 2);
		expect(easeInOutCubic(0)).toBe(0);
		expect(easeInOutCubic(1)).toBe(1);
	});
});
