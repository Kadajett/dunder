import type { ChiefApi, ChiefMessage } from "@shared/chief";
import { afterEach, describe, expect, it, vi } from "vitest";

const message = (id: string, at: number, extra: Partial<ChiefMessage> = {}): ChiefMessage => ({
	id,
	author: "you",
	text: `message ${id}`,
	at,
	...extra,
});

/** What `chief-chat.json` holds: one delivered message and two still queued for a busy Max. */
const ON_DISK: readonly ChiefMessage[] = [
	message("sent", 10, { state: "sent" }),
	message("queued-1", 20, { state: "queued", reason: "max is busy" }),
	message("queued-2", 30, { state: "queued", reason: "max is busy" }),
];

interface FakeChief {
	readonly api: ChiefApi;
	/** Deliver a main-process push (a new message or a state update). */
	push(message: ChiefMessage): void;
}

function fakeChief(history: () => Promise<readonly ChiefMessage[]>): FakeChief {
	const listeners = new Set<(message: ChiefMessage) => void>();
	return {
		api: {
			status: async () => null,
			history,
			onMessage: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			send: async () => ({ state: "sent" }),
		},
		push: (pushed) => {
			for (const listener of listeners) listener(pushed);
		},
	};
}

/** A fresh instance of the chat module, as after a renderer reload or hot replacement. */
async function loadChatStore(chief: ChiefApi) {
	vi.stubGlobal("window", { office: { chief } });
	vi.resetModules();
	return import("./chat-store");
}

/** `[id, state]` of every message the dock would show. */
const shown = (messages: readonly ChiefMessage[]) => messages.map((m) => [m.id, m.state]);

describe("chief chat rehydration", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("restores every message with its delivery state after a full renderer reload", async () => {
		const chief = fakeChief(async () => ON_DISK);
		const before = await loadChatStore(chief.api);
		const disconnect = before.connectChief();
		await vi.waitFor(() => expect(before.useChiefChat.getState().messages).toHaveLength(3));
		disconnect();

		const after = await loadChatStore(chief.api);
		const cleanup = after.connectChief();
		await vi.waitFor(() =>
			expect(shown(after.useChiefChat.getState().messages)).toEqual([
				["sent", "sent"],
				["queued-1", "queued"],
				["queued-2", "queued"],
			]),
		);
		expect(after.useChiefChat.getState().messages[1]?.reason).toBe("max is busy");
		cleanup();
	});

	it("refills an emptied chat from history when the chat is opened", async () => {
		const chief = fakeChief(async () => ON_DISK);
		const chat = await loadChatStore(chief.api);
		const cleanup = chat.connectChief();
		await vi.waitFor(() => expect(chat.useChiefChat.getState().messages).toHaveLength(3));
		chat.useChiefChat.setState({ messages: [] });

		chat.rehydrateChief();
		await vi.waitFor(() =>
			expect(shown(chat.useChiefChat.getState().messages)).toEqual(shown(ON_DISK)),
		);
		cleanup();
	});

	it("keeps a delivery update pushed while history is loading over the older snapshot", async () => {
		const history = Promise.withResolvers<readonly ChiefMessage[]>();
		const chief = fakeChief(() => history.promise);
		const chat = await loadChatStore(chief.api);
		const cleanup = chat.connectChief();
		chief.push(message("queued-1", 20, { state: "sent" }));
		history.resolve(ON_DISK);
		await vi.waitFor(() =>
			expect(shown(chat.useChiefChat.getState().messages)).toEqual([
				["sent", "sent"],
				["queued-1", "sent"],
				["queued-2", "queued"],
			]),
		);
		cleanup();
	});
});
