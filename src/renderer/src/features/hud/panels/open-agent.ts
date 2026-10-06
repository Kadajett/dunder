import { openScreen } from "../../office/focus/open-screen";
import type { SeatedAgent } from "../../office/model/office-model";
import { useHud } from "../view-store";

/** Leave the panel for an agent's screen: switch to the office if needed and zoom into its monitor. */
export function openAgentScreen(seat: SeatedAgent): void {
	const hud = useHud.getState();
	if (hud.view !== "office") hud.setView("office");
	hud.closePanel();
	openScreen(seat);
}
