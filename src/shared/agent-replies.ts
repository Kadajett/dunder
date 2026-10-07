/** An agent's final reply of its last turn, as plain text (markdown stripped, code as '[code]'). */
export interface AgentReply {
	readonly text: string;
	/** Epoch milliseconds, from the session log entry. */
	readonly at: number;
}

/** `window.office.agents`: what live agents said, read from their session logs on demand. */
export interface AgentsApi {
	/**
	 * The named agent's final reply of its last turn; null when it has no omp
	 * session log, the last turn ended without text, or the reply predates the
	 * turn main last saw it start.
	 */
	lastReply(name: string): Promise<AgentReply | null>;
}
