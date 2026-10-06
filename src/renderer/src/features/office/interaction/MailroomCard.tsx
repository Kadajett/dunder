import { useConversations } from "../conversations/conversation-store";

const STATE_LABEL = { queued: "waiting", delivered: "delivered", failed: "failed" } as const;

/** The mail cubby: recent agent-to-agent messages through the office switchboard. */
export function MailroomCard({ close }: { readonly close: () => void }) {
	const heard = useConversations((state) => state.heard);
	return (
		<aside className="world-card mailroom-card">
			<header>
				<i className="status-dot status-done" />
				<strong>MAILROOM</strong>
				<button type="button" className="card-close" onClick={close} aria-label="Close">
					×
				</button>
			</header>
			<p className="card-status">
				Agents talk with <code>office-say &lt;name&gt; "…"</code>
			</p>
			{heard.length === 0 ? <p className="card-empty">No messages yet.</p> : null}
			<ol className="mail-list">
				{heard.slice(0, 12).map(({ message }) => (
					<li key={message.id} data-state={message.state}>
						<div>
							<strong>{message.from}</strong> → <strong>{message.to}</strong>
							<span className="mail-state">{STATE_LABEL[message.state]}</span>
						</div>
						<p>{message.text}</p>
					</li>
				))}
			</ol>
		</aside>
	);
}
