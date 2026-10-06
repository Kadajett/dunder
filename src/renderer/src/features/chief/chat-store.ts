import type { ChiefMessage, ChiefSendResult, ChiefStatus } from "@shared/chief";
import { createLogger } from "@shared/log/logger";
import { create } from "zustand";
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

export const useChiefChat = create<ChiefChatState>(() => ({
	messages: [],
	status: null,
	sending: false,
	notice: null,
}));

/** False while the preload predates the chief (the running app wasn't restarted). */
export const chiefAvailable = "chief" in window.office;

function merge(messages: readonly ChiefMessage[]): void {
	useChiefChat.setState((state) => ({ messages: messages.reduce(upsertMessage, state.messages) }));
}

/** Load history and status, then follow pushed messages and status changes; returns the cleanup. */
export function connectChief(): () => void {
	const office = window.office;
	if (!("chief" in office)) return () => {};
	const { chief } = office;
	let live = true;
	const refresh = () => {
		void chief.status().then(
			(status) => {
				if (live) useChiefChat.setState({ status });
			},
			(error: unknown) => log.warn("status failed", { error }),
		);
	};
	void chief.history().then(
		(history) => {
			if (live) merge(history);
		},
		(error: unknown) => log.warn("history failed", { error }),
	);
	refresh();
	const offs = [chief.onMessage((message) => merge([message]))];
	if ("roster" in office) offs.push(office.roster.onChange(refresh));
	const timer = setInterval(refresh, STATUS_POLL_MS);
	return () => {
		live = false;
		clearInterval(timer);
		for (const off of offs) off();
	};
}

/**
 * Send Jeremy's text to the chief. The main process pushes the message itself
 * (with its delivery state); a refusal's reason is kept as the inline notice.
 */
export async function sendToChief(text: string): Promise<ChiefSendResult> {
	useChiefChat.setState({ sending: true, notice: null });
	try {
		const result = await window.office.chief.send(text);
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
