import type { Desk } from "@shared/layout/schema";
import { POOL_TABLE } from "@shared/pool";
import { OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { type TablePlacement, tableToWorld } from "../../pool/table-space";
import { outerRect, pxToTable } from "../../pool/table-view";
import { screenPlacement } from "../scene/station";
import {
	applyPose,
	CLOTH_Y,
	easeInOutCubic,
	focusPose,
	lerpPose,
	projectScreen,
	projectTable,
	tablePose,
} from "./camera-pose";

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

const table = (degrees: number): TablePlacement => ({
	center: { x: -4, z: 2.5 },
	angle: (degrees * Math.PI) / 180,
});

/** CSS pixels where a point on the cloth (table metres) lands. */
function clothPx(placement: TablePlacement, camera: OrthographicCamera, x: number, y: number) {
	const world = tableToWorld(placement, { x, y });
	const ndc = new Vector3(world.x, CLOTH_Y, world.z).project(camera);
	return { x: ((ndc.x + 1) / 2) * viewport.width, y: ((1 - ndc.y) / 2) * viewport.height };
}

describe("table camera", () => {
	it.each([0, 90, 180, -30])(
		"frames a table turned %i° centred, rim filling 80%%, cloth aspect kept",
		(degrees) => {
			const placement = table(degrees);
			const camera = cameraFor(viewport);
			applyPose(camera, tablePose(placement, viewport));
			const cloth = projectTable(placement, camera, viewport);
			expect(cloth.left + cloth.width / 2).toBeCloseTo(viewport.width / 2, 1);
			expect(cloth.top + cloth.height / 2).toBeCloseTo(viewport.height / 2, 1);
			const rim = outerRect(cloth);
			expect(Math.max(rim.width / viewport.width, rim.height / viewport.height)).toBeCloseTo(
				0.8,
				3,
			);
			expect(cloth.width / cloth.height).toBeCloseTo(POOL_TABLE.length / POOL_TABLE.width, 3);
		},
	);

	it.each([0, 90, 180, -30])("puts table +x right and +y up on screen at %i°", (degrees) => {
		const placement = table(degrees);
		const camera = cameraFor(viewport);
		applyPose(camera, tablePose(placement, viewport));
		const centre = clothPx(placement, camera, 0, 0);
		const foot = clothPx(placement, camera, 0.5, 0);
		const top = clothPx(placement, camera, 0, 0.3);
		expect(foot.x - centre.x).toBeGreaterThan(0);
		expect(foot.y - centre.y).toBeCloseTo(0, 1);
		expect(top.y - centre.y).toBeLessThan(0);
		expect(top.x - centre.x).toBeCloseTo(0, 1);
		// The settled cloth rect maps pixels back to table metres linearly.
		const cloth = projectTable(placement, camera, viewport);
		const back = pxToTable(cloth, clothPx(placement, camera, 0.7, -0.35));
		expect(back.x).toBeCloseTo(0.7, 2);
		expect(back.y).toBeCloseTo(-0.35, 2);
	});

	it("centres the table in a narrowed focus area", () => {
		const placement = table(45);
		const area = { left: 0, top: 0, width: 1100, height: viewport.height };
		const camera = cameraFor(viewport);
		applyPose(camera, tablePose(placement, viewport, area));
		const cloth = projectTable(placement, camera, viewport);
		expect(cloth.left + cloth.width / 2).toBeCloseTo(550, 1);
		expect(cloth.top + cloth.height / 2).toBeCloseTo(viewport.height / 2, 1);
		expect(outerRect(cloth).width / area.width).toBeCloseTo(0.8, 3);
	});

	it("keeps standing agents and the floor in view but clips what hangs over the table", () => {
		const pose = tablePose(table(30), viewport);
		const forward = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
		const depth = (y: number) => new Vector3(-4, y, 2.5).sub(pose.position).dot(forward);
		expect(depth(2.2)).toBeGreaterThan(pose.near);
		expect(depth(0)).toBeLessThan(pose.far);
		expect(depth(CLOTH_Y + 2)).toBeLessThan(pose.near);
	});
});
