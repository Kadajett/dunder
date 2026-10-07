import { createLogger } from "@shared/log/logger";
import type { WorkCard } from "@shared/work-board";
import { useEffect, useState } from "react";
import { laneLabels } from "../work/work-model";
import { useWork, useWorkCards } from "../work/work-store";

const log = createLogger("chief");

/** How long the 'copied' notice stays after clicking an id that isn't on the board. */
const COPIED_MS = 2_000;

/** 'Hire dialog look picker · In progress · carl'. */
export function beadTooltip(card: WorkCard | undefined): string {
	if (!card) return "not on the board";
	return `${card.title} · ${laneLabels[card.lane]} · ${card.assignee ?? "unassigned"}`;
}

/**
 * A bead id in Max's chat: hover says what it is, a click opens its card on
 * the work board, or copies the id when the board doesn't have it. A button,
 * never a link: nothing navigates.
 */
export function BeadChip({ id, code }: { readonly id: string; readonly code: boolean }) {
	const card = useWorkCards()?.find((candidate) => candidate.id === id);
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), COPIED_MS);
		return () => clearTimeout(timer);
	}, [copied]);
	const open = (): void => {
		if (card) {
			useWork.getState().reveal(id);
			return;
		}
		navigator.clipboard.writeText(id).then(
			() => setCopied(true),
			(error: unknown) => log.warn("cannot copy the bead id", { id, error }),
		);
	};
	return (
		<span className="bead-chip-wrap">
			<button
				type="button"
				className="bead-chip"
				data-code={code}
				data-known={card !== undefined}
				title={beadTooltip(card)}
				onClick={open}
			>
				{id}
			</button>
			{copied ? (
				<span className="bead-chip-note" role="status">
					copied {id} (not on the board)
				</span>
			) : null}
		</span>
	);
}
