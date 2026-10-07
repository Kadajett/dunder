import type { HumanAsk } from "@shared/work-board";
import { type Bead, isHumanAsk } from "./cards";

const createdTime = (bead: Bead): number => Date.parse(bead.created_at ?? bead.updated_at) || 0;

/** Open beads with a "blocks" edge to `askId`: the work waiting on the answer. */
function waitingOn(open: readonly Bead[], askId: string): HumanAsk["blocks"] {
	return open
		.filter((bead) =>
			(bead.dependencies ?? []).some(
				(edge) => edge.type === "blocks" && edge.depends_on_id === askId,
			),
		)
		.map((bead) => ({ id: bead.id, title: bead.title }));
}

/** The open asks among the board's open beads: most urgent first, then oldest. */
export function buildAsks(open: readonly Bead[]): HumanAsk[] {
	return open
		.filter(isHumanAsk)
		.sort((a, b) => a.priority - b.priority || createdTime(a) - createdTime(b))
		.map((ask) => ({
			id: ask.id,
			question: ask.title,
			detail: ask.description ?? "",
			asker: ask.assignee || null,
			blocks: waitingOn(open, ask.id),
			createdAt: ask.created_at ?? ask.updated_at,
		}));
}
