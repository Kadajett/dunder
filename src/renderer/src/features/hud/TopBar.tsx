import "./hud.css";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { setSoundsOn, useSounds } from "../audio/sound-store";
import { BrainstormChip } from "../brainstorm/BrainstormChip";
import { CallChip } from "./CallChip";
import { CompanySwitcher } from "./CompanySwitcher";
import { HudClock } from "./HudClock";
import { HudMenu } from "./HudMenu";
import { useUpdateStatus } from "./HudUpdate";
import { InboxGlyph, SoundsOffGlyph } from "./icons";
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
			title={`Trust Inbox · ${items}: asks, blocked agents, spend, app errors, and finished work`}
			onClick={() => togglePanel("inbox")}
		>
			<InboxGlyph />
			{count > 0 ? <span className="hud-count">{count}</span> : null}
		</button>
	);
}

/** Only while Sounds are off (the switch lives in the menu): says so, and one click turns them back on. */
function SoundsOffButton() {
	const on = useSounds((state) => state.on);
	if (on) return null;
	return (
		<button
			type="button"
			className="hud-chip hud-icon-button hud-sounds-off"
			aria-label="Sounds off: turn them back on"
			title="Sounds off: no chimes, and Max's call lines show as captions. Click to turn sounds back on."
			onClick={() => setSoundsOn(true)}
		>
			<SoundsOffGlyph />
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
			<CallChip />
			<BrainstormChip />
			<SoundsOffButton />
			<TrustInboxButton snapshot={snapshot} />
			<HudClock />
			<HudMenu update={update} />
		</header>
	);
}
