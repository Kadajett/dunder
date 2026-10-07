import { parseAskOptions } from "@shared/ask-options";
import { askSnoozeKey } from "@shared/inbox-snooze";
import { type HumanAsk, WORK_RESPONSE_MAX } from "@shared/work-board";
import { useMemo, useState } from "react";
import { dismissAsk, respondToAsk, useAskError } from "../../work/asks-store";
import { useWork } from "../../work/work-store";
import { SnoozeMenu } from "./Snooze";
import "./ask-card.css";

function AnswerForm({ ask, onCancel }: { readonly ask: HumanAsk; readonly onCancel: () => void }) {
	const [text, setText] = useState("");
	const send = (): void => {
		const answer = text.trim();
		if (answer) void respondToAsk(ask.id, answer);
	};
	return (
		<form
			className="hud-ask-answer"
			onSubmit={(event) => {
				event.preventDefault();
				send();
			}}
		>
			<textarea
				// biome-ignore lint/a11y/noAutofocus: opened by clicking Respond, to type the answer.
				autoFocus
				rows={3}
				value={text}
				maxLength={WORK_RESPONSE_MAX}
				placeholder={`Your answer for ${ask.asker ?? "the agent"}`}
				aria-label="Your answer"
				onChange={(event) => setText(event.target.value)}
				onKeyDown={(event) => {
					// Ctrl/Cmd+Enter sends; plain Enter is a new line.
					if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
						event.preventDefault();
						send();
					}
				}}
			/>
			<div className="hud-card-actions">
				<button type="submit" disabled={!text.trim()}>
					Send answer
				</button>
				<button type="button" className="secondary" onClick={onCancel}>
					Cancel
				</button>
			</div>
		</form>
	);
}

/** The answers the agent offered, one click each; the first is its recommendation. */
function OptionButtons({
	ask,
	options,
}: {
	readonly ask: HumanAsk;
	readonly options: readonly string[];
}) {
	return (
		<div className="hud-ask-options">
			{options.map((option, index) => (
				<button
					key={option}
					type="button"
					className={index === 0 ? "hud-ask-option recommended" : "hud-ask-option"}
					title={`Answer ${ask.asker ?? "the agent"}: ${option}`}
					onClick={() => void respondToAsk(ask.id, option)}
				>
					{option}
					{index === 0 ? <span className="hud-ask-recommended">recommended</span> : null}
				</button>
			))}
		</div>
	);
}

/** An agent's ask for Jeremy (a bd `human` bead): what, who, what it blocks; answer (one click when it offers options) or dismiss. */
export function AskCard({ ask }: { readonly ask: HumanAsk }) {
	const [answering, setAnswering] = useState(false);
	const { body, options } = useMemo(() => parseAskOptions(ask.detail), [ask.detail]);
	const error = useAskError(ask.id);
	const reveal = useWork((state) => state.reveal);
	const [blocked] = ask.blocks;
	return (
		<article className="hud-card" data-kind="ask">
			<div className="hud-card-head">
				<i className="status-dot status-ask" />
				<strong>{ask.asker ?? "an agent"}</strong>
				<span className="hud-card-meta">{ask.id}</span>
			</div>
			<p className="hud-card-line">asks you: {ask.question}</p>
			{blocked ? (
				<p className="hud-card-quote">
					blocks {blocked.title}
					{ask.blocks.length > 1 ? ` and ${ask.blocks.length - 1} more` : ""}
				</p>
			) : null}
			{body ? <p className="hud-ask-detail">{body}</p> : null}
			{options.length > 0 && !answering ? <OptionButtons ask={ask} options={options} /> : null}
			{answering ? (
				<AnswerForm ask={ask} onCancel={() => setAnswering(false)} />
			) : (
				<div className="hud-card-actions">
					<button
						type="button"
						className={options.length > 0 ? "secondary" : undefined}
						onClick={() => setAnswering(true)}
					>
						{options.length > 0 ? "Other answer…" : "Respond"}
					</button>
					<button type="button" className="secondary" onClick={() => void dismissAsk(ask.id)}>
						Dismiss
					</button>
					<SnoozeMenu snoozeKey={askSnoozeKey(ask.id)} />
					{blocked ? (
						<button type="button" className="secondary" onClick={() => reveal(blocked.id)}>
							Show in work bar
						</button>
					) : null}
				</div>
			)}
			{error ? <p className="hud-card-error">{error}</p> : null}
		</article>
	);
}
