import { createLogger } from "@shared/log/logger";
import { useChief } from "../chief-store";
import { savedMicId } from "./call-mic";
import { callSnapshot } from "./call-resume";
import { resumeCall, useCall } from "./call-store";

const log = createLogger("call");

const voiceApi = () =>
	"voice" in window.office && "saveCall" in window.office.voice ? window.office.voice : null;

/**
 * Keep main told about the live call (on, mute, mic), so an update's
 * relaunch can pick it up again; returns the cleanup.
 */
export function keepCall(): () => void {
	const voice = voiceApi();
	if (!voice) return () => undefined;
	let saved = JSON.stringify(callSnapshot(useCall.getState(), savedMicId()));
	return useCall.subscribe((state) => {
		const snapshot = callSnapshot(state, savedMicId());
		const key = JSON.stringify(snapshot);
		if (key === saved) return;
		saved = key;
		voice.saveCall(snapshot).catch((error: unknown) => log.warn("cannot keep the call", { error }));
	});
}

/** After an update relaunch during a call: open the chat and pick the call back up, no click. */
export async function resumeAfterUpdate(): Promise<void> {
	const voice = voiceApi();
	if (!voice) return;
	const resume = await voice.resumeCall().catch((error: unknown) => {
		log.warn("cannot ask for the call to resume", { error });
		return null;
	});
	if (!resume || useCall.getState().availability?.available !== true) return;
	log.info("resuming the call after the update", { downAt: resume.downAt });
	useChief.getState().open();
	await resumeCall(resume, Date.now());
}
