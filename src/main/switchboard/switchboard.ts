import { open, readFile, writeFile } from "node:fs/promises";
import type { AgentStatus, SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import {
	deliveryText,
	exceedsPairLimit,
	mailLineSchema,
	type OfficeMessage,
	PAIR_LIMIT,
} from "@shared/switchboard";
import { z } from "zod";
import { type HerdrApi, HerdrApiError } from "../herdr/api-client";
import { type Pending, planDeliveries } from "./delivery-plan";
import { type MailboxTail, tailMailbox } from "./mailbox";
import { linesSince, REPLAY_MAX_AGE_MS } from "./replay";

const log = createLogger("switchboard");

/**
 * The offset only means something for the file it was read from, so it is keyed
 * to that path. `mailboxPath` is absent in state written before that (and in the
 * copy the herdr office → Dunder migration carries over).
 */
const stateSchema = z.object({
	mailboxPath: z.string().optional(),
	offset: z.number().int().nonnegative(),
});
const RECENT_LIMIT = 50;
/** A just-prompted agent may still read idle in the last snapshot; treat it as busy meanwhile. */
const PROMPT_GRACE_MS = 8_000;
/** herdr errors that mean "try again later" rather than "this message is undeliverable". */
const RETRYABLE = new Set(["agent_blocked", "agent_busy", "agent_not_found", "agent_not_ready"]);

export interface SwitchboardDeps {
	readonly api: Pick<HerdrApi, "call">;
	readonly mailboxPath: string;
	/** JSON file remembering which mailbox was read, and how much of it was already handled. */
	readonly statePath: string;
	emit(message: OfficeMessage): void;
	readonly now?: () => number;
}

/** True when `offset` is within the file and starts a line (byte 0, or right after a newline). */
async function startsLine(path: string, offset: number): Promise<boolean> {
	if (offset === 0) return true;
	const handle = await open(path, "r").catch(() => undefined);
	if (!handle) return false;
	try {
		const byte = Buffer.alloc(1);
		const { bytesRead } = await handle.read(byte, 0, 1, offset - 1);
		return bytesRead === 1 && byte[0] === 0x0a;
	} finally {
		await handle.close();
	}
}

/** Where to resume the mailbox, and whether that's a guess (the saved place was lost). */
interface Resume {
	readonly offset: number;
	readonly lost: boolean;
}

const lostPlace: Resume = { offset: 0, lost: true };

/**
 * Where to resume reading `mailboxPath`. A saved offset for another file (the
 * mailbox moved) would land mid-line and silently skip mail, so it starts from
 * the top. A legacy offset with no path is kept only when it plausibly belongs to
 * this file (it starts a line within it): the migration copies the old mailbox
 * and its offset together. Reading from the top is `lost`: only recent mail is
 * delivered, or the whole mailbox would re-prompt agents.
 */
async function resumeOffset(statePath: string, mailboxPath: string): Promise<Resume> {
	const text = await readFile(statePath, "utf8").catch(() => undefined);
	if (text === undefined) return lostPlace;
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return lostPlace;
	}
	const saved = stateSchema.safeParse(json).data;
	if (!saved) return lostPlace;
	if (saved.mailboxPath !== undefined) {
		if (saved.mailboxPath === mailboxPath) return { offset: saved.offset, lost: false };
		log.info("mailbox moved; reading it from the top", {
			from: saved.mailboxPath,
			to: mailboxPath,
		});
		return lostPlace;
	}
	if (await startsLine(mailboxPath, saved.offset)) return { offset: saved.offset, lost: false };
	log.info("legacy offset does not fit the mailbox; reading it from the top", {
		offset: saved.offset,
		mailboxPath,
	});
	return lostPlace;
}

/** Mail sent since `notBefore`, logging how much older mail a lost place skipped. */
function recentMail(lines: readonly string[], notBefore: number): string[] {
	const { fresh, skipped } = linesSince(lines, "sentAt", notBefore);
	if (skipped > 0) log.info("skipped old mail after losing the mailbox place", { skipped });
	return fresh;
}

/** Delivers agent-to-agent mail from the mailbox file through `herdr agent prompt`. */
export class Switchboard {
	readonly #deps: SwitchboardDeps;
	readonly #now: () => number;
	#queue: Pending[] = [];
	#recent: OfficeMessage[] = [];
	#snapshot: SessionSnapshot | undefined;
	/**
	 * Mail read before the first snapshot (the startup backlog): the sender's
	 * name comes from the snapshot's pane → agent map, so it waits for one.
	 */
	#early: string[] = [];
	#prompted = new Map<string, number>();
	#tail: MailboxTail | undefined;
	#timer: NodeJS.Timeout | undefined;
	#pumping = false;

	constructor(deps: SwitchboardDeps) {
		this.#deps = deps;
		this.#now = deps.now ?? Date.now;
	}

	async start(): Promise<void> {
		const { mailboxPath, statePath } = this.#deps;
		const resume = await resumeOffset(statePath, mailboxPath);
		const notBefore = resume.lost ? this.#now() - REPLAY_MAX_AGE_MS : undefined;
		this.#tail = await tailMailbox({
			path: mailboxPath,
			offset: resume.offset,
			onLines: (lines, offset) => {
				this.#accept(notBefore === undefined ? lines : recentMail(lines, notBefore));
				void writeFile(statePath, JSON.stringify({ mailboxPath, offset }));
				void this.pump();
			},
			onError: (error) => log.child("mailbox").warn("read failed", error),
		});
		this.#timer = setInterval(() => void this.pump(), 5_000);
	}

	stop(): void {
		this.#tail?.stop();
		clearInterval(this.#timer);
	}

	updateSnapshot(snapshot: SessionSnapshot): void {
		this.#snapshot = snapshot;
		if (this.#early.length > 0) {
			const early = this.#early;
			this.#early = [];
			log.info("accepting mail read before the first snapshot", { lines: early.length });
			this.#accept(early);
		}
		void this.pump();
	}

	recent(): OfficeMessage[] {
		return [...this.#recent];
	}

	async pump(): Promise<void> {
		if (this.#pumping) return;
		this.#pumping = true;
		try {
			const plan = planDeliveries(this.#queue, (name) => this.#statusOf(name), this.#now());
			this.#queue = [...plan.wait];
			for (const { pending, reason } of plan.fail)
				this.#record({ ...pending.message, state: "failed", error: reason });
			for (const pending of plan.deliver) await this.#deliver(pending);
		} finally {
			this.#pumping = false;
		}
	}

	async #deliver(pending: Pending): Promise<void> {
		const { message } = pending;
		try {
			await this.#deps.api.call(
				"agent.prompt",
				{ target: message.to, text: deliveryText(message) },
				15_000,
			);
			this.#prompted.set(message.to, this.#now());
			this.#record({ ...message, state: "delivered" });
		} catch (error) {
			if (error instanceof HerdrApiError && RETRYABLE.has(error.code)) {
				this.#queue.push(pending);
				return;
			}
			this.#record({
				...message,
				state: "failed",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	#statusOf(name: string): AgentStatus | undefined {
		const promptedAt = this.#prompted.get(name);
		if (promptedAt !== undefined && this.#now() - promptedAt < PROMPT_GRACE_MS) return "working";
		return this.#snapshot?.agents.find((agent) => agent.name === name)?.agent_status;
	}

	#accept(lines: readonly string[]): void {
		if (!this.#snapshot) {
			this.#early.push(...lines);
			return;
		}
		for (const line of lines) {
			let json: unknown;
			try {
				json = JSON.parse(line);
			} catch {
				continue;
			}
			const parsed = mailLineSchema.safeParse(json);
			if (!parsed.success) continue;
			const { id, fromPane, to, text, sentAt } = parsed.data;
			const sender = this.#snapshot?.agents.find((agent) => agent.pane_id === fromPane)?.name;
			const message: OfficeMessage = {
				id,
				from: sender ?? "someone",
				to,
				text,
				sentAt,
				state: "queued",
			};
			if (exceedsPairLimit(this.#recent, message, this.#now())) {
				const error = `conversation limit: ${PAIR_LIMIT.messages} messages between ${message.from} and ${to} in 10 min`;
				this.#record({ ...message, state: "failed", error });
				continue;
			}
			this.#queue.push({ message, receivedAt: this.#now() });
			this.#record(message);
		}
	}

	#record(message: OfficeMessage): void {
		this.#recent = [...this.#recent.filter((m) => m.id !== message.id), message].slice(
			-RECENT_LIMIT,
		);
		this.#deps.emit(message);
	}
}
