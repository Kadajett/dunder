import { WHATS_NEW_TRY_ROWS, type WhatsNew, type WhatsNewBead } from "@shared/whats-new";

/** Features before bugs before everything else. */
const TYPE_RANK: Readonly<Record<string, number>> = { feature: 0, bug: 1 };
const rank = (bead: WhatsNewBead): number => TYPE_RANK[bead.type ?? ""] ?? 2;

export interface CardSections {
	/** At most `WHATS_NEW_TRY_ROWS` beads with a Try it line: features first, then newest. */
	readonly tryThese: readonly WhatsNewBead[];
	/** Every other bead that changed what Jeremy sees, newest first. */
	readonly also: readonly WhatsNewBead[];
	/** Commits without a bead. */
	readonly others: readonly string[];
	/** Beads whose commits touch only tooling, docs for agents, tests or CI. */
	readonly underTheHood: readonly WhatsNewBead[];
	/** How many changes 'Also changed' holds. */
	readonly alsoCount: number;
}

/** How the card splits a build's changes: a few things to try, the rest folded. */
export function cardSections(card: WhatsNew): CardSections {
	const candidates = card.beads.filter((bead) => bead.tryIt !== null && !bead.internal);
	// A stable sort keeps newest-first within each type.
	const tryThese = [...candidates].sort((a, b) => rank(a) - rank(b)).slice(0, WHATS_NEW_TRY_ROWS);
	const rest = card.beads.filter((bead) => !tryThese.includes(bead));
	const also = rest.filter((bead) => !bead.internal);
	const underTheHood = rest.filter((bead) => bead.internal);
	return {
		tryThese,
		also,
		others: card.others,
		underTheHood,
		alsoCount: rest.length + card.others.length,
	};
}
