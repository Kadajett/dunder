import { WHATS_NEW_FEEDBACK_MAX, WHATS_NEW_ROWS, type WhatsNewBead } from "@shared/whats-new";
import { useEffect, useState } from "react";
import { dismissWhatsNew, loadWhatsNew, rateBead, useWhatsNew } from "./whats-new-store";
import "./whats-new.css";

/** 👎 asks "What's off?" first; Enter or leaving the field sends it (text optional), Esc cancels. */
function DownNote({ id, onDone }: { readonly id: string; readonly onDone: () => void }) {
	const [text, setText] = useState("");
	const send = () => {
		onDone();
		void rateBead(id, "down", text.trim());
	};
	return (
		<input
			className="whats-new__note"
			// biome-ignore lint/a11y/noAutofocus: opened by the 👎 click, so typing goes straight in.
			autoFocus
			maxLength={WHATS_NEW_FEEDBACK_MAX}
			placeholder="What's off? (optional, Enter to send)"
			aria-label="What's off?"
			value={text}
			onChange={(event) => setText(event.target.value)}
			onBlur={send}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
				if (event.key === "Escape") onDone();
			}}
		/>
	);
}

function Row({
	bead,
	ratingOff,
}: {
	readonly bead: WhatsNewBead;
	readonly ratingOff: string | null;
}) {
	const [noting, setNoting] = useState(false);
	const error = useWhatsNew((state) => state.errors[bead.id]);
	const off = ratingOff ?? undefined;
	return (
		<li className="whats-new__row">
			<div className="whats-new__what">
				<span className="whats-new__id">{bead.id}</span>
				<span className="whats-new__title">{bead.title ?? bead.subject}</span>
				{bead.tryIt && <span className="whats-new__try">Try it: {bead.tryIt}</span>}
				{noting && <DownNote id={bead.id} onDone={() => setNoting(false)} />}
				{error && <span className="whats-new__error">{error}</span>}
			</div>
			<div className="whats-new__thumbs">
				<button
					type="button"
					aria-label={`Good: ${bead.id}`}
					aria-pressed={bead.rating === "up"}
					disabled={ratingOff !== null}
					title={off ?? "It does what I wanted"}
					onClick={() => void rateBead(bead.id, "up")}
				>
					👍
				</button>
				<button
					type="button"
					aria-label={`Not right: ${bead.id}`}
					aria-pressed={bead.rating === "down"}
					disabled={ratingOff !== null}
					title={off ?? "Something's off (Max hears about it)"}
					onClick={() => setNoting(true)}
				>
					👎
				</button>
			</div>
		</li>
	);
}

/** Top-centre after Dunder relaunches on a new commit: what shipped, how to try it, thumbs. */
export function WhatsNewCard() {
	useEffect(loadWhatsNew, []);
	const card = useWhatsNew((state) => state.card);
	const [more, setMore] = useState(false);
	const [othersOpen, setOthersOpen] = useState(false);
	if (!card) return null;
	const rows = more ? card.beads : card.beads.slice(0, WHATS_NEW_ROWS);
	const hidden = card.beads.length - rows.length;
	return (
		<section className="whats-new" aria-label="What's new">
			<header className="whats-new__header">
				<div>
					<h2 className="whats-new__heading">
						{card.recent ? "What's new (recent)" : "What's new"}
					</h2>
					<span className="whats-new__build">Dunder is now on {card.built.slice(0, 7)}</span>
				</div>
				<button type="button" className="whats-new__done" onClick={dismissWhatsNew}>
					Got it
				</button>
			</header>
			{rows.length > 0 && (
				<ol className="whats-new__rows">
					{rows.map((bead) => (
						<Row key={bead.id} bead={bead} ratingOff={card.ratingOff} />
					))}
				</ol>
			)}
			{hidden > 0 && (
				<button type="button" className="whats-new__more" onClick={() => setMore(true)}>
					{hidden} more
				</button>
			)}
			{card.others.length > 0 && (
				<div className="whats-new__others">
					<button
						type="button"
						className="whats-new__more"
						aria-expanded={othersOpen}
						onClick={() => setOthersOpen((open) => !open)}
					>
						+ {card.others.length} other {card.others.length === 1 ? "change" : "changes"}
					</button>
					{othersOpen && (
						<ul>
							{card.others.map((subject, index) => (
								// Subjects can repeat; the list never reorders.
								// biome-ignore lint/suspicious/noArrayIndexKey: static list
								<li key={index}>{subject}</li>
							))}
						</ul>
					)}
				</div>
			)}
		</section>
	);
}
