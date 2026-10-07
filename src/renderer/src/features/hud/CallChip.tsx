import { CHIEF_NAME } from "@shared/chief";
import { useCall } from "../chief/call/call-store";
import { useChiefChat } from "../chief/chat-store";
import { useChief } from "../chief/chief-store";

/** In the top bar during a voice call with the chief, while his dock is closed: the way back to the call. */
export function CallChip() {
	const active = useCall((s) => s.active);
	const dockOpen = useChief((state) => state.expanded);
	const name = useChiefChat((state) => state.status?.name) ?? CHIEF_NAME;
	if (!active || dockOpen) return null;
	return (
		<button
			type="button"
			className="hud-chip hud-call-chip"
			title="Open the Chief of Staff dock"
			onClick={() => useChief.getState().open()}
		>
			<span className="hud-call-dot" />
			<span>
				On a call with <span className="hud-call-name">{name}</span>
			</span>
		</button>
	);
}
