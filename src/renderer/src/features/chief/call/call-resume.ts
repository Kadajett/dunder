import type { CallResume, CallSnapshot } from "@shared/voice";

/** Whole seconds the call was down for the relaunch (at least 1). */
export function missedSeconds(resume: CallResume, now: number): number {
	return Math.max(1, Math.round((now - resume.downAt) / 1000));
}

/** The strip's note when the call picks up again. */
export function resumedHint(resume: CallResume, now: number): string {
	return `Call resumed after the update · missed ${missedSeconds(resume, now)} s while updating`;
}

/** What Max is told on resume, as a call turn so he answers with one spoken line. */
export function resumedNote(resume: CallResume, now: number): string {
	return `(Dunder just updated and relaunched; the call was down for ${missedSeconds(resume, now)} s and anything Jeremy said then was lost. Say one short line that you're back.)`;
}

/** What main keeps of the call: null when there's none. */
export function callSnapshot(
	state: {
		readonly active: boolean;
		readonly muted: boolean;
		readonly mic: { readonly deviceId: string | undefined } | null;
		readonly startedAt: number;
	},
	chosenMic: string | null,
): CallSnapshot | null {
	if (!state.active) return null;
	return {
		muted: state.muted,
		deviceId: state.mic?.deviceId ?? chosenMic,
		startedAt: state.startedAt,
	};
}
