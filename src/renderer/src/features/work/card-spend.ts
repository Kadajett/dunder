import type { WorkCard } from "@shared/work-board";

/** `~$1.23`: approximate, never to the cent of truth. */
export function spendLabel(usd: number): string {
	return `~$${usd.toFixed(2)}`;
}

/** How a card's figure was worked out, for its tooltip. */
export function spendTitle(card: WorkCard): string {
	const until = card.lane === "done" ? "closed it" : "now";
	return [
		`About ${spendLabel(card.spend ?? 0).slice(1)} of AI spend on this bead.`,
		`Counted as everything ${card.assignee ?? "the assignee"} spent from claiming it until ${until}.`,
		"Approximate: work on other beads in that time counts here too, and Max's dispatch and reviews don't.",
	].join("\n");
}

/** The epic tag's tooltip: its name, and its beads' spend when known. */
export function epicTitle(card: WorkCard): string {
	const name = `Epic: ${card.epic ?? ""}`;
	if (!card.epicSpend) return name;
	const { usd, beads } = card.epicSpend;
	const counted = `${beads} ${beads === 1 ? "bead" : "beads"} open or closed in the last 30 days`;
	return `${name}\n${spendLabel(usd)} across ${counted} (each bead: its assignee's spend while it was open).`;
}
