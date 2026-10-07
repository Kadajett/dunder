import { WHATS_NEW_FEEDBACK_MAX, type WhatsNew, type WhatsNewBead } from "@shared/whats-new";
import { useState } from "react";
import { cardSections } from "./whats-new-model";
import { dismissWhatsNew, rateBead, useWhatsNew } from "./whats-new-store";
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

/** How many changes shipped, beads and other commits together. */
export const changeCount = (card: WhatsNew): number => card.beads.length + card.others.length;

/** Titles only, no thumbs: what else shipped. */
function TitleList({ beads }: { readonly beads: readonly WhatsNewBead[] }) {
	return (
		<ul>
			{beads.map((bead) => (
				<li key={bead.id} title={bead.id}>
					{bead.title ?? bead.subject}
				</li>
			))}
		</ul>
	);
}

/** 'Also changed (N)': the beads not to try, commits without a bead, then 'Under the hood'. */
function AlsoChanged({
	card,
	startOpen,
}: {
	readonly card: WhatsNew;
	readonly startOpen: boolean;
}) {
	const [open, setOpen] = useState(startOpen);
	const { also, others, underTheHood, alsoCount } = cardSections(card);
	if (alsoCount === 0) return null;
	return (
		<div className="whats-new__others">
			<button
				type="button"
				className="whats-new__more"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				Also changed ({alsoCount}) {open ? "▴" : "▾"}
			</button>
			{open && (
				<>
					<TitleList beads={also} />
					{others.length > 0 && (
						<ul>
							{others.map((subject, index) => (
								// Subjects can repeat; the list never reorders.
								// biome-ignore lint/suspicious/noArrayIndexKey: static list
								<li key={index}>{subject}</li>
							))}
						</ul>
					)}
					{underTheHood.length > 0 && (
						<>
							<p className="whats-new__subhead">Under the hood</p>
							<TitleList beads={underTheHood} />
						</>
					)}
				</>
			)}
		</div>
	);
}

/**
 * 'Try these': at most three beads with a Try it line and thumbs, so a
 * rating asks for something doable in a minute; everything else folds into
 * 'Also changed'. Capped at 45 vh, then it scrolls.
 */
export function WhatsNewRows({ card }: { readonly card: WhatsNew }) {
	const { tryThese } = cardSections(card);
	return (
		<div className="whats-new__list">
			{tryThese.length > 0 ? (
				<>
					<p className="whats-new__subhead">Try these</p>
					<ol className="whats-new__rows">
						{tryThese.map((bead) => (
							<Row key={bead.id} bead={bead} ratingOff={card.ratingOff} />
						))}
					</ol>
				</>
			) : (
				<p className="whats-new__nothing">Nothing to try this time</p>
			)}
			<AlsoChanged card={card} startOpen={tryThese.length === 0} />
		</div>
	);
}

/** 'Dunder updated · 10 changes · Review ▾': one line until he opens it. */
export function ReviewToggle({
	card,
	open,
	onToggle,
}: {
	readonly card: WhatsNew;
	readonly open: boolean;
	readonly onToggle: () => void;
}) {
	const count = changeCount(card);
	return (
		<button type="button" className="whats-new__review" aria-expanded={open} onClick={onToggle}>
			Dunder updated{card.recent ? " (recent)" : ""} · {count} {count === 1 ? "change" : "changes"}{" "}
			· {open ? "Hide ▴" : "Review ▾"}
		</button>
	);
}

/**
 * After Dunder relaunches on a new commit: one line in the notice slot,
 * opening to what shipped, how to try it, and thumbs.
 */
export function WhatsNewCard() {
	const card = useWhatsNew((state) => state.card);
	const [open, setOpen] = useState(false);
	if (!card) return null;
	return (
		<section className="whats-new" data-open={open} aria-label="What's new">
			<header className="whats-new__header whats-new__header--line">
				<ReviewToggle card={card} open={open} onToggle={() => setOpen((value) => !value)} />
				<button type="button" className="whats-new__done" onClick={dismissWhatsNew}>
					Got it
				</button>
			</header>
			{open ? (
				<>
					<span className="whats-new__build">Dunder is now on {card.built.slice(0, 7)}</span>
					<WhatsNewRows card={card} />
				</>
			) : null}
		</section>
	);
}
