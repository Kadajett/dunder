import { basename } from "node:path";
import {
	CHIEF_HISTORY_LIMIT,
	type ChiefMessage,
	type ChiefPresence,
	type ChiefSendResult,
	type ChiefStatus,
} from "@shared/chief";
import type { RosterAgent } from "@shared/company/roster";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { SessionTail } from "../omp/session-tail";
import type { OfficeCli } from "../workforce/spawner";
import { loadChiefHistory, saveChiefHistory } from "./history-store";
import { type ChiefReply, extractReplies, INITIAL_REPLY_STATE, type ReplyState } from "./replies";
import { chiefPrompt, planChiefSend } from "./send-plan";

const POLL_MS = 1_000;
/** Longest chat message the history file accepts (`chiefMessageSchema`). */
const MESSAGE_TEXT_MAX = 64_000;

export interface ChiefServiceDeps {
	readonly cli: OfficeCli;
	readonly historyPath: string;
	/** The active roster agent with role `CHIEF_ROLE`, if one is hired. */
	readonly chief: () => RosterAgent | undefined;
	readonly modelOf: (name: string) => string | undefined;
	/** Push a new message, or an update to one already sent (same `id`). */
	readonly emit: (message: ChiefMessage) => void;
	readonly now: () => number;
	readonly newId: () => string;
}

/** The chief as last seen in the office session. */
interface LiveChief {
	readonly name: string;
	readonly presence: ChiefPresence;
}

/**
 * Jeremy's chat with the Chief of Staff. Messages are typed into the chief's
 * omp session (only while he waits for a prompt; otherwise queued until he
 * is free), and his answers are read back from his session log.
 */
export class ChiefService {
	readonly #deps: ChiefServiceDeps;
	#messages: ChiefMessage[] = [];
	#ready: Promise<void> = Promise.resolve();
	#live: LiveChief | undefined;
	#tail: SessionTail | undefined;
	#replyState: ReplyState = INITIAL_REPLY_STATE;
	#timer: NodeJS.Timeout | undefined;
	#polling = false;
	#flushing = false;

	constructor(deps: ChiefServiceDeps) {
		this.#deps = deps;
	}

	start(): void {
		if (this.#timer) return;
		this.#ready = loadChiefHistory(this.#deps.historyPath).then((messages) => {
			this.#messages = messages;
		});
		this.#timer = setInterval(() => void this.poll(), POLL_MS);
		this.#timer.unref();
	}

	stop(): void {
		clearInterval(this.#timer);
		this.#timer = undefined;
	}

	/** Follow the chief's presence and session log; hand him queued messages once he is free. */
	update(snapshot: SessionSnapshot): void {
		const chief = this.#deps.chief();
		if (!chief) {
			this.#live = undefined;
			this.#tail = undefined;
			return;
		}
		const agent = snapshot.agents.find((candidate) => candidate.name === chief.name);
		this.#live = { name: chief.name, presence: agent?.agent_status ?? "offline" };
		const session = agent?.agent_session;
		const sessionPath = session?.kind === "path" ? session.value : undefined;
		if (sessionPath && sessionPath !== this.#tail?.path) {
			// Replay from the start; reply ids and timestamps keep old turns out of the chat.
			this.#tail = new SessionTail(sessionPath, "start");
			this.#replyState = INITIAL_REPLY_STATE;
		}
		const presence = this.#live.presence;
		if (presence === "idle" || presence === "done") void this.#flush();
	}

	status(): ChiefStatus | null {
		const chief = this.#deps.chief();
		if (!chief) return null;
		const status = this.#live?.name === chief.name ? this.#live.presence : "offline";
		const model = this.#deps.modelOf(chief.name);
		return {
			name: chief.name,
			role: chief.role,
			status,
			...(model !== undefined && { model }),
			style: chief.style,
		};
	}

	async history(): Promise<readonly ChiefMessage[]> {
		await this.#ready;
		return [...this.#messages];
	}

	async send(text: string): Promise<ChiefSendResult> {
		await this.#ready;
		const status = this.status();
		if (!status) return { state: "rejected", reason: "No Chief of Staff is on the roster" };
		const plan = planChiefSend(status.name, status.status);
		const state = plan.kind === "send" ? "sent" : plan.kind === "queue" ? "queued" : "rejected";
		const message: ChiefMessage = {
			id: this.#deps.newId(),
			author: "you",
			text,
			at: this.#deps.now(),
			state,
			...(plan.kind !== "send" && { reason: plan.reason }),
		};
		this.#append([message]);
		if (plan.kind !== "send") return { state, reason: plan.reason };
		const failure = await this.#deliver(status.name, [message]);
		return failure === undefined ? { state: "sent" } : { state: "rejected", reason: failure };
	}

	/** Read the chief's new session log lines and surface his replies to Jeremy. */
	async poll(): Promise<void> {
		if (this.#polling) return;
		this.#polling = true;
		try {
			await this.#ready;
			const tail = this.#tail;
			if (!tail) return;
			const lines = await tail.lines();
			if (this.#tail !== tail) return;
			const { state, replies } = extractReplies(this.#replyState, lines);
			this.#replyState = state;
			this.#acceptReplies(basename(tail.path), replies);
		} catch (error) {
			console.warn("[chief] could not read the chief's session log:", error);
		} finally {
			this.#polling = false;
		}
	}

	/** Send every queued message in one prompt. */
	async #flush(): Promise<void> {
		const name = this.#live?.name;
		if (this.#flushing || name === undefined) return;
		const queued = this.#messages.filter((message) => message.state === "queued");
		if (queued.length === 0) return;
		this.#flushing = true;
		try {
			const sent = queued.map(
				({ reason: _reason, ...message }): ChiefMessage => ({
					...message,
					state: "sent",
				}),
			);
			this.#replace(sent);
			await this.#deliver(name, sent);
		} finally {
			this.#flushing = false;
		}
	}

	/** Type the messages into the chief; on failure they are marked rejected. Returns the failure. */
	async #deliver(name: string, messages: readonly ChiefMessage[]): Promise<string | undefined> {
		try {
			const prompt = chiefPrompt(messages.map((message) => message.text));
			await this.#deps.cli(["agent", "prompt", name, prompt]);
			return undefined;
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			const reason = `could not reach ${name}: ${detail}`.slice(0, 500);
			const rejected = messages.map(
				(message): ChiefMessage => ({ ...message, state: "rejected", reason }),
			);
			this.#replace(rejected);
			return reason;
		}
	}

	/**
	 * Add replies not already in the chat. Replies older than Jeremy's first
	 * message or the newest reply shown predate this chat or were shown before,
	 * so replaying a session log from its start never resurrects old turns.
	 */
	#acceptReplies(sessionFile: string, replies: readonly ChiefReply[]): void {
		const yours = this.#messages.filter((message) => message.author === "you");
		if (yours.length === 0 || replies.length === 0) return;
		const earliestYou = Math.min(...yours.map((message) => message.at));
		let newestChief = Math.max(
			-1,
			...this.#messages.filter((m) => m.author === "chief").map((m) => m.at),
		);
		const ids = new Set(this.#messages.map((message) => message.id));
		const added: ChiefMessage[] = [];
		for (const reply of replies) {
			const id = `${sessionFile}:${reply.entryId}`;
			if (ids.has(id) || reply.at <= earliestYou || reply.at <= newestChief) continue;
			const text = reply.text.slice(0, MESSAGE_TEXT_MAX);
			added.push({ id, author: "chief", text, at: reply.at });
			newestChief = reply.at;
		}
		if (added.length > 0) this.#append(added);
	}

	#append(messages: readonly ChiefMessage[]): void {
		this.#messages = [...this.#messages, ...messages].slice(-CHIEF_HISTORY_LIMIT);
		for (const message of messages) this.#deps.emit(message);
		this.#persist();
	}

	#replace(updates: readonly ChiefMessage[]): void {
		const byId = new Map(updates.map((message) => [message.id, message]));
		this.#messages = this.#messages.map((message) => byId.get(message.id) ?? message);
		for (const message of updates) this.#deps.emit(message);
		this.#persist();
	}

	#persist(): void {
		saveChiefHistory(this.#deps.historyPath, this.#messages).catch((error: unknown) =>
			console.warn("[chief] could not save the chat:", error),
		);
	}
}
