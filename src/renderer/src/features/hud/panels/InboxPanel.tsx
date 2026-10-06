import type { SessionSnapshot } from "@shared/herdr/schema";
import type { OfficeModel } from "../../office/model/office-model";
import { markSeen, useTrustInbox } from "../inbox-store";
import type { TrustItem } from "../trust-inbox";
import { openAgentScreen } from "./open-agent";

const KIND_LINE = {
	blocked: "needs you — waiting on your answer",
	done: "finished, not seen yet",
} as const;

function InboxCard({ item, model }: { readonly item: TrustItem; readonly model: OfficeModel }) {
	const { agent } = item;
	const seat = model.seated.find((seated) => seated.agent.paneId === agent.paneId);
	return (
		<article className="hud-card" data-kind={item.kind}>
			<div className="hud-card-head">
				<i className={`status-dot status-${item.kind}`} />
				<strong>{agent.name}</strong>
				<span className="hud-card-meta">
					{agent.workspaceLabel ? `#${agent.workspaceLabel}` : agent.paneId}
				</span>
			</div>
			<p className="hud-card-line">{KIND_LINE[item.kind]}</p>
			{agent.activity ? <p className="hud-card-quote">{agent.activity}</p> : null}
			<div className="hud-card-actions">
				<button
					type="button"
					disabled={!seat}
					title={seat ? undefined : "This agent has no desk in the office layout"}
					onClick={() => {
						if (!seat) return;
						if (item.kind === "done") markSeen(agent);
						openAgentScreen(seat);
					}}
				>
					Open screen
				</button>
				{item.kind === "done" ? (
					<button type="button" className="secondary" onClick={() => markSeen(agent)}>
						Mark seen
					</button>
				) : null}
			</div>
		</article>
	);
}

/** Trust Inbox: blocked agents and finished work the user has not seen. */
export function InboxPanel(props: {
	readonly model: OfficeModel;
	readonly snapshot: SessionSnapshot | null;
}) {
	const items = useTrustInbox(props.snapshot);
	if (items.length === 0) {
		return (
			<p className="hud-panel-empty">
				Nothing needs you. Blocked agents and finished work you have not seen yet land here.
			</p>
		);
	}
	return (
		<>
			{items.map((item) => (
				<InboxCard key={`${item.kind}:${item.agent.paneId}`} item={item} model={props.model} />
			))}
		</>
	);
}
