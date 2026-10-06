import type { AgentStatus } from "@shared/herdr/schema";
import type { OfficeMessage } from "@shared/switchboard";

export interface Pending {
	readonly message: OfficeMessage;
	/** When the switchboard first saw the message (ms). */
	readonly receivedAt: number;
}

export interface DeliveryPlan {
	readonly deliver: readonly Pending[];
	readonly fail: readonly { readonly pending: Pending; readonly reason: string }[];
	readonly wait: readonly Pending[];
}

/** How long a message waits for a recipient that is not in the office before failing. */
export const MISSING_RECIPIENT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Decide which queued messages go out now. A message is only delivered to an
 * agent ready for input (idle/done): a working agent's turn is never
 * interrupted and a blocked agent's dialog is never answered. At most one
 * message per recipient per round, in arrival order.
 */
export function planDeliveries(
	queue: readonly Pending[],
	statusOf: (name: string) => AgentStatus | undefined,
	now: number,
): DeliveryPlan {
	const deliver: Pending[] = [];
	const fail: { pending: Pending; reason: string }[] = [];
	const wait: Pending[] = [];
	const served = new Set<string>();
	for (const pending of queue) {
		const to = pending.message.to;
		const status = statusOf(to);
		if (status === undefined && now - pending.receivedAt >= MISSING_RECIPIENT_TIMEOUT_MS) {
			fail.push({ pending, reason: `no agent named ${to} in the office` });
		} else if ((status === "idle" || status === "done") && !served.has(to)) {
			served.add(to);
			deliver.push(pending);
		} else {
			wait.push(pending);
		}
	}
	return { deliver, fail, wait };
}
