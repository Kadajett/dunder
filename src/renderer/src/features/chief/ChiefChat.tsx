import type { AvatarStyle } from "@shared/avatar/style";
import { CHIEF_MESSAGE_MAX, type ChiefMessage, type ChiefPresence } from "@shared/chief";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { formatClock } from "../feed/feed-model";
import { ChiefAvatar } from "./ChiefAvatar";
import { ChiefMarkdown } from "./ChiefMarkdown";
import { CallButton, CallStrip } from "./call/CallStrip";
import { isWorking, presenceLabel } from "./chat-model";
import { rehydrateChief, sendToChief, useChiefChat } from "./chat-store";
import "./chief-chat.css";

function Bubble({ message }: { readonly message: ChiefMessage }) {
	const mine = message.author === "you";
	const pending = mine && message.state !== undefined && message.state !== "sent";
	// A reply that was only its spoken line shows just the caption.
	const spokenOnly = message.spoken !== undefined && message.spoken === message.text;
	return (
		<li className={`chief-msg chief-msg--${mine ? "you" : "chief"}`}>
			{/* Jeremy's own text stays plain (newlines kept by CSS); the chief writes Markdown. */}
			{!spokenOnly && (
				<div className="chief-msg__bubble">
					{mine ? message.text : <ChiefMarkdown text={message.text} />}
				</div>
			)}
			{message.spoken !== undefined && (
				<p className="chief-msg__spoken" title="Said aloud on the call">
					🔊 {message.spoken}
				</p>
			)}
			<div className="chief-msg__meta">
				<time dateTime={new Date(message.at).toISOString()}>{formatClock(message.at)}</time>
				{message.call && (
					<span className="chief-msg__call" title="Said on a call">
						📞 on a call
					</span>
				)}
				{pending && (
					<span className={`chief-msg__state chief-msg__state--${message.state}`}>
						{message.state === "queued" ? "queued" : "not sent"}
						{message.reason ? ` · ${message.reason}` : ""}
					</span>
				)}
			</div>
		</li>
	);
}

function Composer({ name }: { readonly name: string }) {
	const [draft, setDraft] = useState("");
	const sending = useChiefChat((state) => state.sending);
	const input = useRef<HTMLTextAreaElement>(null);
	useEffect(() => input.current?.focus(), []);
	const empty = draft.trim().length === 0;
	const submit = async () => {
		const text = draft.trim();
		if (text.length === 0 || sending) return;
		setDraft("");
		const result = await sendToChief(text);
		// Give a refused message back so it can be fixed and resent.
		if (result.state === "rejected") setDraft((current) => current || text);
	};
	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
		event.preventDefault();
		void submit();
	};
	return (
		<form
			className="chief-chat__composer"
			onSubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<textarea
				ref={input}
				className="chief-chat__input"
				rows={1}
				value={draft}
				maxLength={CHIEF_MESSAGE_MAX}
				placeholder={`Message ${name}…`}
				aria-label={`Message ${name}`}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={onKeyDown}
			/>
			<button type="submit" className="chief-chat__send" disabled={empty || sending}>
				Send
			</button>
		</form>
	);
}

export interface ChiefChatProps {
	/** Display name, e.g. `Max`. */
	readonly name: string;
	/** Small-caps role line, e.g. `CHIEF OF STAFF`. */
	readonly role: string;
	readonly presence: ChiefPresence;
	readonly style: AvatarStyle | null;
	readonly onClose: () => void;
}

/** The expanded dock: Jeremy's conversation with the Chief of Staff. */
export function ChiefChat({ name, role, presence, style, onClose }: ChiefChatProps) {
	const messages = useChiefChat((state) => state.messages);
	const notice = useChiefChat((state) => state.notice);
	const list = useRef<HTMLOListElement>(null);
	// Opening the chat re-reads the history, so it never shows less than is on disk.
	useEffect(rehydrateChief, []);
	const working = isWorking(presence);
	const newest = messages.at(-1);
	// Keep the newest message (or the working indicator) in view as they arrive.
	useEffect(() => {
		const element = list.current;
		if (!element || (newest === undefined && !working)) return;
		element.scrollTop = element.scrollHeight;
	}, [newest, working]);
	// A refusal already shown under its own bubble needs no second notice.
	const shownNotice = messages.some((m) => m.state === "rejected" && m.reason === notice)
		? null
		: notice;
	return (
		<section
			className="chief-chat"
			aria-label={`Chat with ${name}`}
			onKeyDown={(event) => {
				if (event.key === "Escape") onClose();
			}}
		>
			<header className="chief-chat__header">
				<ChiefAvatar style={style} size={34} />
				<div className="chief-chat__title">
					<span className="chief-chat__name">{name}</span>
					<span className="chief-chat__role">
						{role} · {presenceLabel(presence)}
					</span>
				</div>
				<CallButton name={name} />
				<button
					type="button"
					className="chief-chat__close"
					aria-label="Close chat"
					onClick={onClose}
				>
					×
				</button>
			</header>
			<ol className="chief-chat__list" ref={list} aria-live="polite">
				{messages.length === 0 && (
					<li className="chief-chat__empty">
						Ask {name} to coordinate the team — briefs, hand-offs and check-ins land here.
					</li>
				)}
				{messages.map((message) => (
					<Bubble key={message.id} message={message} />
				))}
				{working && (
					<li className="chief-chat__working">
						{name} is working
						<span className="chief-chat__dots" aria-hidden="true">
							<span />
							<span />
							<span />
						</span>
					</li>
				)}
			</ol>
			{shownNotice && <p className="chief-chat__notice">Not sent: {shownNotice}</p>}
			<CallStrip name={name} />
			<Composer name={name} />
		</section>
	);
}
