import { useCall } from "@renderer/features/chief/call/call-store";
import { useChief } from "@renderer/features/chief/chief-store";
import { NOW } from "./fake-office-hud";

/** The 07-call-dock state: Max mid-sentence on a call, the dock open. */
export function startCall(): void {
	useChief.getState().open();
	useCall.setState({
		availability: { available: true },
		active: true,
		since: NOW - 4 * 60_000,
		phase: "speaking",
		muted: false,
		mic: { deviceId: "default", label: "Default - Jabra Evolve2 65" },
		level: 0.22,
		heard: "Yes to the photos. Give me a minute on Node.",
		error: null,
		hint: null,
	});
}
