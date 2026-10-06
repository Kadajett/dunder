import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import type { Zone } from "@shared/layout/schema";
import { describe, expect, it } from "vitest";
import { hoverZoneAt, RUGLESS_REACH } from "./zone-hover";

const zones = DEFAULT_LAYOUT.zones;

describe("hoverZoneAt", () => {
	it("finds the hover zone whose rug is under the point", () => {
		// Just behind your desk, where the floor ray lands when pointing at its monitor.
		expect(hoverZoneAt(zones, { x: 6.9, z: 1.9 })).toBe("you");
	});

	it("reaches around the label point of a zone without a rug", () => {
		expect(hoverZoneAt(zones, { x: 5.4, z: 7.4 })).toBe("reception");
		// The floor point behind the OPEN ROLES board's face.
		expect(hoverZoneAt(zones, { x: 6.5, z: 6.1 })).toBe("reception");
		expect(hoverZoneAt(zones, { x: 5.4 + RUGLESS_REACH + 0.1, z: 7.8 })).toBeNull();
	});

	it("ignores zones that always show their card, and no pointer at all", () => {
		// The middle of the #SALES rug.
		expect(hoverZoneAt(zones, { x: -6.6, z: 3.4 })).toBeNull();
		expect(hoverZoneAt(zones, null)).toBeNull();
		const always: Zone[] = zones.map(({ labelMode: _mode, ...zone }) => zone);
		expect(hoverZoneAt(always, { x: 6.9, z: 1.9 })).toBeNull();
	});
});
