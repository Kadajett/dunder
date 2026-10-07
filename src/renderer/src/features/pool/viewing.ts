/** What decides whether Jeremy is at the pool table right now. */
export interface ViewingState {
	/** The table view is open and the camera has settled over it. */
	readonly settled: boolean;
	/** The window is focused and visible: he can actually see it. */
	readonly active: boolean;
}

/**
 * Keeps main's `jeremy.viewing` in step: true only while the table view is
 * settled in an active window (blur, minimise or leaving hands his turns to
 * the autopilot), and sent only when it changes.
 */
export function viewingSync(send: (viewing: boolean) => void): (state: ViewingState) => void {
	let sent: boolean | undefined;
	return ({ settled, active }) => {
		const viewing = settled && active;
		if (viewing === sent) return;
		sent = viewing;
		send(viewing);
	};
}
