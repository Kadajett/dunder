import type { Unsubscribe } from "./screens";

/** What a needs-you alert points at in the Trust Inbox. */
export type AlertTarget =
	| { readonly kind: "blocked"; readonly paneId: string }
	| { readonly kind: "ask"; readonly id: string };

/** The Trust Inbox item key for a target (as the inbox keys its cards). */
export function alertItemKey(target: AlertTarget): string {
	return target.kind === "ask" ? `ask:${target.id}` : `blocked:${target.paneId}`;
}

/** `window.office.alerts`: desktop alerts when an agent needs Jeremy while Dunder isn't in front. */
export interface AlertsApi {
	muted(): Promise<boolean>;
	setMuted(muted: boolean): Promise<void>;
	/** Main asks for the soft chime (a new batch of needs-you items). */
	onChime(listener: () => void): Unsubscribe;
	/** Jeremy clicked a notification: open the Trust Inbox on this item. */
	onOpen(listener: (target: AlertTarget) => void): Unsubscribe;
}
