import { VIEWING_PING_MS } from "@shared/pool";

/**
 * While the table view is open, tell main so at once and every
 * `VIEWING_PING_MS`, whatever the window's focus: Jeremy aims with the chat
 * dock or another window focused, and his shot must stay his. Returns the
 * stop, which tells main the view closed (his grace starts then).
 */
export function pingViewing(send: (viewing: boolean) => void): () => void {
	send(true);
	const timer = setInterval(() => send(true), VIEWING_PING_MS);
	return () => {
		clearInterval(timer);
		send(false);
	};
}
