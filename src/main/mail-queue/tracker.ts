import type { ChiefMessage } from "@shared/chief";
import { type MailQueue, queuedMail } from "@shared/mail-queue";
import type { OfficeMessage } from "@shared/switchboard";

export interface MailQueueDeps {
	/** The Chief of Staff's agent name, if one is hired: Jeremy's chat waits for him. */
	readonly chiefName: () => string | undefined;
	/** Push the queue to the windows; only called when it changed. */
	readonly emit: (queue: MailQueue) => void;
}

/**
 * Follows every switchboard message and chat message as main emits them, and
 * keeps the per-agent queue of undelivered mail. Only queued messages are kept:
 * a delivered, failed, sent or rejected update removes its note.
 */
export class MailQueueTracker {
	readonly #deps: MailQueueDeps;
	readonly #agentMail = new Map<string, OfficeMessage>();
	readonly #chiefMail = new Map<string, ChiefMessage>();
	#queue: MailQueue = {};
	#published = "{}";

	constructor(deps: MailQueueDeps) {
		this.#deps = deps;
	}

	current(): MailQueue {
		return this.#queue;
	}

	/** A switchboard message was queued, delivered or failed. */
	switchboard(message: OfficeMessage): void {
		if (message.state === "queued") this.#agentMail.set(message.id, message);
		else this.#agentMail.delete(message.id);
		this.#publish();
	}

	/** A chat message was added or changed state. */
	chief(message: ChiefMessage): void {
		if (message.author === "you" && message.state === "queued")
			this.#chiefMail.set(message.id, message);
		else this.#chiefMail.delete(message.id);
		this.#publish();
	}

	/** Chat history loaded at startup: messages queued before a restart still wait. */
	chiefHistory(messages: readonly ChiefMessage[]): void {
		for (const message of messages) {
			if (message.author === "you" && message.state === "queued")
				this.#chiefMail.set(message.id, message);
		}
		this.#publish();
	}

	#publish(): void {
		const queue = queuedMail(
			this.#agentMail.values(),
			this.#chiefMail.values(),
			this.#deps.chiefName(),
		);
		const json = JSON.stringify(queue);
		if (json === this.#published) return;
		this.#queue = queue;
		this.#published = json;
		this.#deps.emit(queue);
	}
}
