import type { DecorKind, Layout } from "@shared/layout/schema";
import { DEG, type Placement, visitorPlacement } from "../scene/station";

/** Decor people walk up to, and how far in front of its centre they stand. */
const VISITABLE: Partial<Record<DecorKind, number>> = {
	"water-cooler": 0.8,
	"coffee-table": 0.9,
	bookshelf: 0.9,
	printer: 0.9,
	"mail-cubby": 0.9,
	"reception-desk": 1.1,
	"notice-board": 0.8,
	plant: 0.8,
};

/** Standing spots in front of visitable decor, facing it. */
export function decorSpots(layout: Layout): Placement[] {
	return layout.decor.flatMap((item) => {
		const distance = VISITABLE[item.kind];
		if (distance === undefined) return [];
		const angle = item.rotation * DEG;
		return [
			{
				position: {
					x: item.position.x + Math.sin(angle) * distance,
					z: item.position.z + Math.cos(angle) * distance,
				},
				rotationY: angle + Math.PI,
			},
		];
	});
}

/**
 * Pick where an idle agent goes: usually a colleague's desk (to chat) when
 * someone else is seated, otherwise a piece of visitable decor.
 */
export function chooseSpot(
	random: () => number,
	decor: readonly Placement[],
	colleagueDesks: readonly Layout["desks"][number][],
): Placement | undefined {
	const visitColleague = colleagueDesks.length > 0 && random() < 0.4;
	if (visitColleague) {
		const desk = colleagueDesks[Math.floor(random() * colleagueDesks.length)];
		if (desk) return visitorPlacement(desk);
	}
	return decor[Math.floor(random() * decor.length)];
}
