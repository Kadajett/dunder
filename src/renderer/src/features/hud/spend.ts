import type { CostToday } from "@shared/office-stats";
import type { WorkCard } from "@shared/work-board";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatUsd(value: number): string {
	return usd.format(value);
}

/** The AI cost tile's hover text: the day and its sources, then every agent's spend today, biggest first. */
export function costBreakdown(cost: Extract<CostToday, { state: "ok" }>): string {
	const header = `${cost.day} · summed from ${cost.sessions} omp session log${cost.sessions === 1 ? "" : "s"}`;
	const spenders = cost.agents.map((agent) => `${agent.name}  ${formatUsd(agent.usd)}`);
	const untracked = cost.untracked.map((name) => `${name}  not tracked (not on omp)`);
	return [header, ...spenders, ...untracked].join("\n");
}

/** An agent spending fast enough to be worth a look. */
export interface Spender {
	readonly name: string;
	readonly recentUsd: number;
	/** The bead it is working on (in progress, assigned to it), if any. */
	readonly bead: { readonly id: string; readonly title: string } | undefined;
}

/**
 * Agents whose spend in the alarm window is above `thresholdUsd`, fastest
 * first. Informs only: the item goes once the window's spend falls back.
 */
export function runawaySpenders(
	cost: CostToday,
	thresholdUsd: number,
	cards: readonly WorkCard[] = [],
): Spender[] {
	if (cost.state !== "ok") return [];
	return cost.agents
		.filter((agent) => agent.recentUsd > thresholdUsd)
		.sort((a, b) => b.recentUsd - a.recentUsd)
		.map((agent) => {
			const card = cards.find((c) => c.lane === "in_progress" && c.assignee === agent.name);
			return {
				name: agent.name,
				recentUsd: agent.recentUsd,
				bead: card && { id: card.id, title: card.title },
			};
		});
}

/** What "Tell Max" sends the chief of staff about a runaway spender. */
export function tellMaxText(spender: Spender, windowMinutes: number): string {
	const on = spender.bead ? ` on ${spender.bead.id} (${spender.bead.title})` : "";
	return `${spender.name} has spent ${formatUsd(spender.recentUsd)} in the last ${windowMinutes} minutes${on}. Can you check whether it's stuck in a loop?`;
}
