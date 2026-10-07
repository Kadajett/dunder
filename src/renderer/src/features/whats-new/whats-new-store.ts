import { createLogger } from "@shared/log/logger";
import type { WhatsNew, WhatsNewRating } from "@shared/whats-new";
import { create } from "zustand";

const log = createLogger("whats-new");

interface WhatsNewState {
	/** Null while loading, after "Got it", or when there is nothing new. */
	readonly card: WhatsNew | null;
	/** Why a row's rating didn't stick, by bead id. */
	readonly errors: Readonly<Record<string, string>>;
	/** Main has answered (card or not), so cards that queue behind it can show. */
	readonly settled: boolean;
}

export const useWhatsNew = create<WhatsNewState>(() => ({
	card: null,
	errors: {},
	settled: false,
}));

const api = () => ("whatsNew" in window.office ? window.office.whatsNew : null);
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Ask main for the card once per window. */
export function loadWhatsNew(): void {
	const whatsNew = api();
	if (!whatsNew) {
		useWhatsNew.setState({ settled: true });
		return;
	}
	void whatsNew
		.get()
		.then((card) => useWhatsNew.setState({ card, settled: true }))
		.catch((error: unknown) => {
			log.warn("no what's new card", { error });
			useWhatsNew.setState({ settled: true });
		});
}

function setRating(id: string, rating: WhatsNewRating | null): void {
	useWhatsNew.setState((state) => ({
		card: state.card && {
			...state.card,
			beads: state.card.beads.map((bead) => (bead.id === id ? { ...bead, rating } : bead)),
		},
	}));
}

/** Shows the thumb at once; puts the old one back with the reason if bd refuses. */
export async function rateBead(id: string, rating: WhatsNewRating, text = ""): Promise<void> {
	const whatsNew = api();
	const before = useWhatsNew.getState().card?.beads.find((bead) => bead.id === id)?.rating ?? null;
	if (!whatsNew) return;
	setRating(id, rating);
	useWhatsNew.setState((state) => ({ errors: { ...state.errors, [id]: "" } }));
	const result = await whatsNew
		.rate({ id, rating, text })
		.catch((error: unknown) => ({ ok: false as const, reason: reasonOf(error) }));
	if (result.ok) return;
	setRating(id, before);
	useWhatsNew.setState((state) => ({
		errors: { ...state.errors, [id]: `Couldn't save that: ${result.reason}` },
	}));
}

/** "Got it": gone for good for this build. */
export function dismissWhatsNew(): void {
	useWhatsNew.setState({ card: null });
	void api()
		?.dismiss()
		.catch((error: unknown) => log.warn("dismiss failed", { error }));
}
