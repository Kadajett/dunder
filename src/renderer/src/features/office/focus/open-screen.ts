import type { SeatedAgent } from "../model/office-model";
import { screenPlacement } from "../scene/station";
import { useFocus } from "./focus-store";

/** Zoom into an agent's computer and open its live terminal. */
export function openScreen({ desk, agent }: SeatedAgent): void {
	useFocus.getState().focus({
		kind: "screen",
		deskId: desk.id,
		paneId: agent.paneId,
		agentName: agent.name,
		// Seated agents are agent TUIs (omp/claude/codex), which all enable bracketed paste.
		bracketedPaste: true,
		screen: screenPlacement(desk),
	});
}
