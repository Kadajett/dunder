import "./hud.css";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { CompanySwitcher } from "./CompanySwitcher";
import { HudClock } from "./HudClock";
import { HudMenu } from "./HudMenu";
import { UpdateCountdownBanner, useUpdateStatus } from "./HudUpdate";
import { InboxGlyph } from "./icons";
import { useTrustInbox } from "./inbox-store";
import { useHud } from "./view-store";

export interface TopBarProps {
	readonly snapshot: SessionSnapshot | null;
}

function TrustInboxButton({ snapshot }: { readonly snapshot: SessionSnapshot | null }) {
	const count = useTrustInbox(snapshot).length;
	const open = useHud((state) => state.panel === "inbox");
	const togglePanel = useHud((state) => state.togglePanel);
	const items = `${count} item${count === 1 ? "" : "s"}`;
	return (
		<button
			type="button"
			className="hud-chip hud-icon-button hud-inbox"
			aria-pressed={open}
			aria-label={`Trust Inbox, ${items}`}
			title={`Trust Inbox · ${items}: blocked agents and finished work not seen yet`}
			onClick={() => togglePanel("inbox")}
		>
			<InboxGlyph />
			{count > 0 ? <span className="hud-count">{count}</span> : null}
		</button>
	);
}

/** The HUD's top bar: the company, the Trust Inbox, the clock and one menu for everything else. */
export function TopBar({ snapshot }: TopBarProps) {
	const update = useUpdateStatus();
	return (
		<header className="hud-topbar">
			<CompanySwitcher snapshot={snapshot} />
			<span className="hud-spacer" />
			<TrustInboxButton snapshot={snapshot} />
			<HudClock />
			<HudMenu update={update} />
			<UpdateCountdownBanner status={update} />
		</header>
	);
}
