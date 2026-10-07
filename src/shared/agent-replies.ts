/** An agent's final reply of its last turn, as plain text (markdown stripped, code as '[code]'). */
export interface AgentReply {
	readonly text: string;
	/** Epoch milliseconds, from the session log entry. */
	readonly at: number;
}

/** Longest reason Jeremy can give for an interrupt. */
export const INTERRUPT_REASON_MAX = 300;

export type InterruptResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: string };

/** `window.office.agents`: what live agents said, read from their session logs on demand; and stopping one. */
export interface AgentsApi {
	/**
	 * The named agent's final reply of its last turn; null when it has no omp
	 * session log, the last turn ended without text, or the reply predates the
	 * turn main last saw it start.
	 */
	lastReply(name: string): Promise<AgentReply | null>;
	/**
	 * Stop the agent's current turn (Escape), wait until it stops, then tell it
	 * why and to report where it is; Max hears about it too.
	 */
	interrupt(name: string, reason: string): Promise<InterruptResult>;
}
