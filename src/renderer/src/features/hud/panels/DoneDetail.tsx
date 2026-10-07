import "./done-detail.css";
import { useState } from "react";
import { useWork, useWorkCards } from "../../work/work-store";
import { agentBead, replyShown } from "../done-card";
import { useLastReply } from "../last-reply";
import type { InboxAgent } from "../trust-inbox";

/** 'Said:' the agent's final reply, 3 lines with 'more' (to 40, then the screen has the rest). */
function Said({ text }: { readonly text: string }) {
	const [open, setOpen] = useState(false);
	const shown = replyShown(text, open);
	return (
		<div className="hud-card-said">
			<span className="hud-card-label">Said</span>
			<p className="hud-card-quote">{shown.text}</p>
			{shown.more ? (
				<button type="button" className="hud-card-more" onClick={() => setOpen(true)}>
					more
				</button>
			) : null}
			{shown.cut ? <span className="hud-card-more-note">Open screen for the rest</span> : null}
		</div>
	);
}

/** 'Bead:' the work behind it; a click opens that card on the work board. */
function Bead({ name }: { readonly name: string }) {
	const cards = useWorkCards();
	const bead = cards ? agentBead(cards, name, Date.now()) : null;
	if (!bead) return null;
	return (
		<div className="hud-card-bead">
			<span className="hud-card-label">Bead</span>
			<button
				type="button"
				title="Open on the work board"
				onClick={() => useWork.getState().reveal(bead.id)}
			>
				<code>{bead.id}</code> {bead.title}
			</button>
		</div>
	);
}

/**
 * What a finished agent delivered: its final reply (omp agents; others keep
 * herdr's activity line) and its bead.
 */
export function DoneDetail({ agent }: { readonly agent: InboxAgent }) {
	const reply = useLastReply(agent);
	const activity = agent.activity ? <p className="hud-card-quote">{agent.activity}</p> : null;
	return (
		<>
			{reply ? <Said text={reply.text} /> : activity}
			<Bead name={agent.name} />
		</>
	);
}
