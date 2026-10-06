import type { Vec2, Zone } from "@shared/layout/schema";

/**
 * How far from its label point a zone without a rug reaches. Generous enough
 * that pointing at the objects there (the reception desk, the OPEN ROLES board)
 * counts: under the isometric camera, the floor point behind a tall object lies
 * up to ~2 units back from it.
 */
export const RUGLESS_REACH = 2.6;

function contains(zone: Zone, point: Vec2): boolean {
	if (zone.rug) {
		const { center, width, depth } = zone.rug;
		return Math.abs(point.x - center.x) <= width / 2 && Math.abs(point.z - center.z) <= depth / 2;
	}
	if (!zone.labelAt) return false;
	return Math.hypot(point.x - zone.labelAt.x, point.z - zone.labelAt.z) <= RUGLESS_REACH;
}

/**
 * The hover-labelled zone under a floor point (where the pointer's ray meets
 * the floor): inside its rug, or near the label point of a zone with no rug.
 * Zones that always show their card are ignored.
 */
export function hoverZoneAt(zones: readonly Zone[], point: Vec2 | null): string | null {
	if (!point) return null;
	return zones.find((zone) => zone.labelMode === "hover" && contains(zone, point))?.id ?? null;
}
