/** Failures surface through the status (state "failed"), so a rejected call needs no handling. */
export function applyUpdate(reason: string): void {
	window.office.update.apply(reason).catch(() => undefined);
}

/** Cancel a countdown, or skip a held update or a batch. */
export const skipUpdate = (): void => void window.office.update.cancel().catch(() => undefined);

/** "Theo", or "Theo + 2 more" when several agents asked. */
export function requesters({ by, extra }: { readonly by: string; readonly extra: number }): string {
	const who = by.charAt(0).toUpperCase() + by.slice(1);
	return extra > 0 ? `${who} + ${extra} more` : who;
}
