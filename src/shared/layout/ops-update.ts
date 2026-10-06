import { snapInRoom } from "./ops";
import type { Callout, Decor, Desk, Layout, Zone } from "./schema";

/**
 * Pure field edits for the edit-mode inspector. Text fields set to "" remove
 * the optional field; an unknown id leaves the layout unchanged.
 */

const MIN_RUG = 1;
const DEFAULT_RUG_COLOR = "#d9c7a5";

export interface ZonePatch {
	readonly title?: string;
	readonly subtitle?: string;
	/** herdr workspace label the zone's desks seat agents from. */
	readonly workspaceLabel?: string;
	readonly rugWidth?: number;
	readonly rugDepth?: number;
	readonly rugColor?: string;
}

const clampSize = (value: number, max: number) =>
	Math.min(Math.max(MIN_RUG, max), Math.max(MIN_RUG, value));

function patchRug(layout: Layout, zone: Zone, patch: ZonePatch): Zone["rug"] {
	const resized =
		patch.rugWidth !== undefined || patch.rugDepth !== undefined || patch.rugColor !== undefined;
	if (!resized) return zone.rug;
	const base = zone.rug ?? {
		center: zone.labelAt ?? { x: 0, z: 0 },
		width: 4,
		depth: 3,
		color: DEFAULT_RUG_COLOR,
	};
	const width = clampSize(patch.rugWidth ?? base.width, layout.room.width);
	const depth = clampSize(patch.rugDepth ?? base.depth, layout.room.depth);
	// Re-clamp the centre so a grown rug stays inside the room.
	const center = snapInRoom(layout, base.center, width / 2, depth / 2);
	return { center, width, depth, color: patch.rugColor ?? base.color };
}

/** Edit a zone's title, subtitle, bound workspace label and rug size/colour (adding a rug if it has none). */
export function updateZone(layout: Layout, id: string, patch: ZonePatch): Layout {
	const edit = (zone: Zone): Zone => {
		const { subtitle, workspaceLabel, rug: _rug, ...rest } = zone;
		const nextSubtitle = patch.subtitle ?? subtitle;
		const nextLabel = patch.workspaceLabel ?? workspaceLabel;
		const rug = patchRug(layout, zone, patch);
		return {
			...rest,
			title: patch.title ?? zone.title,
			...(nextSubtitle ? { subtitle: nextSubtitle } : {}),
			...(nextLabel ? { workspaceLabel: nextLabel } : {}),
			...(rug ? { rug } : {}),
		};
	};
	return { ...layout, zones: layout.zones.map((zone) => (zone.id === id ? edit(zone) : zone)) };
}

export interface DeskPatch {
	/** Live herdr agent name pinned to the desk. */
	readonly agentName?: string;
	/** Zone the desk belongs to; must name an existing zone. */
	readonly zoneId?: string;
}

export function updateDesk(layout: Layout, id: string, patch: DeskPatch): Layout {
	const zoneIds = new Set(layout.zones.map((zone) => zone.id));
	const edit = (desk: Desk): Desk => {
		const { agentName, zoneId, ...rest } = desk;
		const nextName = patch.agentName ?? agentName;
		const nextZone = patch.zoneId ?? zoneId;
		return {
			...rest,
			...(nextName ? { agentName: nextName } : {}),
			...(nextZone && zoneIds.has(nextZone) ? { zoneId: nextZone } : {}),
		};
	};
	return { ...layout, desks: layout.desks.map((desk) => (desk.id === id ? edit(desk) : desk)) };
}

export function updateDecor(layout: Layout, id: string, patch: { readonly label: string }): Layout {
	const edit = (decor: Decor): Decor => {
		const { label: _label, ...rest } = decor;
		return patch.label ? { ...rest, label: patch.label } : rest;
	};
	return { ...layout, decor: layout.decor.map((item) => (item.id === id ? edit(item) : item)) };
}

export function updateCallout(
	layout: Layout,
	id: string,
	patch: { readonly title?: string; readonly subtitle?: string },
): Layout {
	const edit = (callout: Callout): Callout => {
		const { subtitle, ...rest } = callout;
		const nextSubtitle = patch.subtitle ?? subtitle;
		return {
			...rest,
			title: patch.title ?? callout.title,
			...(nextSubtitle ? { subtitle: nextSubtitle } : {}),
		};
	};
	return {
		...layout,
		callouts: layout.callouts.map((item) => (item.id === id ? edit(item) : item)),
	};
}

/** Put every desk standing on the zone's rug into the zone. */
export function claimDesks(layout: Layout, zoneId: string): Layout {
	const rug = layout.zones.find((zone) => zone.id === zoneId)?.rug;
	if (!rug) return layout;
	const onRug = (desk: Desk) =>
		Math.abs(desk.position.x - rug.center.x) <= rug.width / 2 &&
		Math.abs(desk.position.z - rug.center.z) <= rug.depth / 2;
	return {
		...layout,
		desks: layout.desks.map((desk) => (onRug(desk) ? { ...desk, zoneId } : desk)),
	};
}
