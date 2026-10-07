import type { WorkCard } from "@shared/work-board";

export interface AgentBeadsProps {
	readonly agentName: string;
	readonly cards: readonly WorkCard[] | undefined;
}

/** Lists this agent's in-progress beads and opens their description and acceptance criteria. */
export function AgentBeads({ agentName, cards }: AgentBeadsProps) {
	if (cards === undefined) return <p className="card-empty">Bead data unavailable.</p>;
	const beads = cards.filter((card) => card.lane === "in_progress" && card.assignee === agentName);
	if (beads.length === 0) return <p className="card-empty">No bead.</p>;
	return (
		<section className="agent-beads">
			<p className="agent-beads__label">In-progress beads</p>
			{beads.map((bead) => (
				<details className="agent-beads__item" key={bead.id}>
					<summary>
						<code>{bead.id}</code> · {bead.title}
					</summary>
					<div className="agent-beads__detail">
						<p className="agent-beads__label">Description</p>
						<p>{bead.description.trim() || "No description."}</p>
						<p className="agent-beads__label">Acceptance criteria</p>
						<p>{bead.acceptance.trim() || "No acceptance criteria."}</p>
					</div>
				</details>
			))}
		</section>
	);
}
