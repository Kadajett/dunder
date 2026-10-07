import type { SessionSnapshot } from "@shared/herdr/schema";
import { blockedSnoozeKey } from "@shared/inbox-snooze";
import { type ReactNode, useEffect, useRef } from "react";
import type { OfficeModel } from "../../office/model/office-model";
import { markSeen, useInbox } from "../inbox-store";
import type { TrustItem } from "../trust-inbox";
import { useHud } from "../view-store";
import { AskCard } from "./AskCard";
import { DoneDetail } from "./DoneDetail";
import { ErrorCard } from "./ErrorCard";
import { openAgentScreen } from "./open-agent";
import { SnoozedPeek, SnoozeMenu } from "./Snooze";
import { SpendCard } from "./SpendCard";

const KIND_LINE = {
	blocked: "needs you — waiting on your answer",
	done: "finished, not seen yet",
} as const;

type AgentItem = Extract<TrustItem, { kind: "blocked" } | { kind: "done" }>;

function AgentCard({ item, model }: { readonly item: AgentItem; readonly model: OfficeModel }) {
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
			{item.kind === "blocked" && agent.activity ? (
				<p className="hud-card-quote">{agent.activity}</p>
			) : null}
			{item.kind === "done" ? <DoneDetail agent={agent} /> : null}
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
				) : (
					<SnoozeMenu snoozeKey={blockedSnoozeKey(agent.name)} />
				)}
			</div>
		</article>
	);
}

function itemKey(item: TrustItem): string {
	if (item.kind === "ask") return `ask:${item.ask.id}`;
	if (item.kind === "error") return `error:${item.error.id}`;
	return `${item.kind}:${item.agent.paneId}`;
}

function ItemCard({
	item,
	model,
}: {
	readonly item: TrustItem;
	readonly model: OfficeModel;
}): ReactNode {
	if (item.kind === "ask") return <AskCard ask={item.ask} />;
	if (item.kind === "error") return <ErrorCard error={item.error} />;
	if (item.kind === "spend") return <SpendCard item={item} model={model} />;
	return <AgentCard item={item} model={model} />;
}

/** One inbox card; the one a notification pointed at scrolls into view and flashes. */
function InboxItem({ item, model }: { readonly item: TrustItem; readonly model: OfficeModel }) {
	const key = itemKey(item);
	const focused = useHud((state) => state.focusItem === key);
	const frame = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (focused) frame.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [focused]);
	return (
		<div
			ref={frame}
			className={`hud-inbox-item${focused ? " hud-inbox-item--focus" : ""}`}
			data-item-key={key}
		>
			<ItemCard item={item} model={model} />
		</div>
	);
}

/** Trust Inbox: blocked agents, the app's own errors, what agents asked of Jeremy, runaway spend and finished work he has not seen; snoozed items wait under 'N snoozed'. */
export function InboxPanel(props: {
	readonly model: OfficeModel;
	readonly snapshot: SessionSnapshot | null;
}) {
	const { awake, snoozed } = useInbox(props.snapshot);
	return (
		<>
			<SnoozedPeek snoozed={snoozed} />
			{awake.length === 0 ? (
				<p className="hud-panel-empty">
					Nothing needs you. Blocked agents, app errors, agents' asks, agents spending fast and
					finished work you have not seen yet land here.
				</p>
			) : (
				awake.map((item) => <InboxItem key={itemKey(item)} item={item} model={props.model} />)
			)}
		</>
	);
}
