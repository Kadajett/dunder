import type { PlanItem, PlanProposal } from "@shared/plan";

const label = (item: PlanItem): string => `${item.bead} (${item.who})`;

function itemChanges(before: readonly PlanItem[], after: readonly PlanItem[]): string[] {
	const was = new Map(before.map((item) => [item.bead, item]));
	const now = new Map(after.map((item) => [item.bead, item]));
	const lines: string[] = [];
	for (const item of before) if (!now.has(item.bead)) lines.push(`removed ${label(item)}`);
	for (const item of after) {
		const old = was.get(item.bead);
		if (!old) lines.push(`added ${label(item)}: ${item.why}`);
		else if (old.who !== item.who) lines.push(`reassigned ${item.bead}: ${old.who} → ${item.who}`);
		if (old && old.why !== item.why) lines.push(`${item.bead} why: ${item.why}`);
	}
	const kept = before.filter((item) => now.has(item.bead)).map((item) => item.bead);
	const order = after.filter((item) => was.has(item.bead)).map((item) => item.bead);
	if (kept.join(" ") !== order.join(" ")) lines.push(`new order: ${order.join(", ")}`);
	return lines;
}

function notTodayChanges(before: readonly string[], after: readonly string[]): string[] {
	return [
		...before.filter((text) => !after.includes(text)).map((text) => `back on the table: ${text}`),
		...after.filter((text) => !before.includes(text)).map((text) => `not today: ${text}`),
	];
}

/**
 * What Jeremy changed in Max's proposal, one change per line, for the
 * '[plan edited]' message: focus, removed / added / reassigned items, a new
 * order, and the not-today list. Empty when nothing changed.
 */
export function planDiff(before: PlanProposal, after: PlanProposal): string[] {
	return [
		...(before.focus === after.focus ? [] : [`focus: ${after.focus}`]),
		...itemChanges(before.items, after.items),
		...notTodayChanges(before.notToday, after.notToday),
	];
}
