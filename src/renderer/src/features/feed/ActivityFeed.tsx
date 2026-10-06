import { useEffect } from "react";
import { useSelection } from "../office/interaction/selection-store";
import { type FeedItem, formatClock } from "./feed-model";
import { connectFeed, useFeed } from "./feed-store";
import "./feed.css";

const PEEK = 3;

function FeedCard({ item }: { readonly item: FeedItem }) {
	const select = useSelection((state) => state.select);
	const { paneId } = item;
	return (
		<li className={`feed-card feed-card--${item.tone}`}>
			<button
				type="button"
				className="feed-card__body"
				disabled={!paneId}
				onClick={() => paneId && select({ kind: "agent", paneId })}
			>
				<time className="feed-card__time">{formatClock(item.at)}</time>
				<span className="feed-card__text">
					<strong>{item.agent}:</strong> {item.action}
				</span>
			</button>
		</li>
	);
}

/** Bottom-left live feed: newest cards above a pill that expands into the full list. */
export function ActivityFeed() {
	const items = useFeed((state) => state.items);
	const unseen = useFeed((state) => state.unseen);
	const expanded = useFeed((state) => state.expanded);
	const toggle = useFeed((state) => state.toggle);
	useEffect(connectFeed, []);
	const shown = expanded ? items : items.slice(0, PEEK);
	return (
		<section className={`feed${expanded ? " feed--open" : ""}`} aria-label="Activity Feed">
			{shown.length > 0 && (
				<ol className="feed__list">
					{shown.map((item) => (
						<FeedCard key={item.id} item={item} />
					))}
				</ol>
			)}
			<button type="button" className="feed__pill" onClick={toggle} aria-expanded={expanded}>
				<span className="feed__dot" />
				<span className="feed__title">Activity Feed</span>
				<span className="feed__sub">· watch it live</span>
				{unseen > 0 && <span className="feed__count">{unseen}</span>}
				<span className="feed__chevron">{expanded ? "▼" : "▲"}</span>
			</button>
		</section>
	);
}
