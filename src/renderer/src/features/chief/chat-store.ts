import type { ChiefApi, ChiefMessage, ChiefSendResult, ChiefStatus } from "@shared/chief";
import { createLogger } from "@shared/log/logger";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { upsertMessage } from "./chat-model";

const log = createLogger("chief");

/** Status is re-read this often too, since herdr status changes don't touch the roster. */
const STATUS_POLL_MS = 5_000;

interface ChiefChatState {
	readonly messages: readonly ChiefMessage[];
	/** Null until loaded, or while no chief is on the roster. */
	readonly status: ChiefStatus | null;
	readonly sending: boolean;
	/** Why the last send was refused, until the next send. */
	readonly notice: string | null;
}

type ChiefChatStore = UseBoundStore<StoreApi<ChiefChatState>>;

function createChiefChat(): ChiefChatStore {
	return create<ChiefChatState>(() => ({
		messages: [],
		status: null,
		sending: false,
		notice: null,
	}));
}

/**
 * The chat, kept across hot replacement of this module: a re-created store
 * would start empty while the dock's listeners still fed the old one.
 */
export const useChiefChat: ChiefChatStore =
	(import.meta.hot?.data.chiefChat as ChiefChatStore | undefined) ?? createChiefChat();
if (import.meta.hot) import.meta.hot.data.chiefChat = useChiefChat;

/** False while the preload predates the chief (the running app wasn't restarted). */
export const chiefAvailable = "chief" in window.office;

function merge(messages: readonly ChiefMessage[]): void {
	useChiefChat.setState((state) => ({ messages: messages.reduce(upsertMessage, state.messages) }));
}

/**
 * Rehydrate the chat from the on-disk history while following pushed messages.
 * A push that lands while a history read is in flight is newer than that
 * snapshot (queued → sent), so it is re-applied on top of it.
 */
function historySync(chief: ChiefApi, isLive: () => boolean) {
	const inFlight = new Set<ChiefMessage[]>();
	return {
		push(message: ChiefMessage): void {
			for (const pushed of inFlight) pushed.push(message);
			merge([message]);
		},
		hydrate(): void {
			const pushed: ChiefMessage[] = [];
			inFlight.add(pushed);
			void chief
				.history()
				.then(
					(history) => {
						if (isLive()) merge([...history, ...pushed]);
					},
					(error: unknown) => log.warn("history failed", { error }),
				)
				.finally(() => inFlight.delete(pushed));
		},
	};
}

/** The connected dock's history reload, for `rehydrateChief`. */
let hydrateConnected: (() => void) | null = null;

/**
 * Load history and status, then follow pushed messages and status changes;
 * returns the cleanup. Connecting always rehydrates from the on-disk history,
 * so a remounted dock shows the chat whatever the store held.
 */
export function connectChief(): () => void {
	const office = window.office;
	if (!("chief" in office)) return () => {};
	const { chief } = office;
	let live = true;
	const sync = historySync(chief, () => live);
	const refresh = () => {
		void chief.status().then(
			(status) => {
				if (live) useChiefChat.setState({ status });
			},
			(error: unknown) => log.warn("status failed", { error }),
		);
	};
	const offs = [chief.onMessage(sync.push)];
	sync.hydrate();
	hydrateConnected = sync.hydrate;
	refresh();
	if ("roster" in office) offs.push(office.roster.onChange(refresh));
	const timer = setInterval(refresh, STATUS_POLL_MS);
	return () => {
		live = false;
		if (hydrateConnected === sync.hydrate) hydrateConnected = null;
		clearInterval(timer);
		for (const off of offs) off();
	};
}

/** Re-read the history into the chat (the chat was opened); a no-op until connected. */
export function rehydrateChief(): void {
	hydrateConnected?.();
}

/**
 * Send Jeremy's text to the chief. The main process pushes the message itself
 * (with its delivery state); a refusal's reason is kept as the inline notice.
 */
export async function sendToChief(
	text: string,
	options?: { readonly call?: boolean },
): Promise<ChiefSendResult> {
	useChiefChat.setState({ sending: true, notice: null });
	try {
		const result = await window.office.chief.send(text, options);
		if (result.state === "rejected")
			useChiefChat.setState({ notice: result.reason ?? "Max couldn't take that message." });
		return result;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		useChiefChat.setState({ notice: reason });
		return { state: "rejected", reason };
	} finally {
		useChiefChat.setState({ sending: false });
	}
}
