import { randomUUID } from "node:crypto";
import {
	type Brainstorm,
	type BrainstormRequestLine,
	brainstormRequestLineSchema,
	brainstormTopicSchema,
} from "@shared/brainstorm";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import { type FreeWaitDeps, whenFree } from "../calisthenics/coach";

const log = createLogger("brainstorm");

/** Requests older than this (made while the app was closed) are ignored. */
const REQUEST_MAX_AGE_MS = 10 * 60_000;
/** How long an invitation waits for a busy agent to finish its turn. */
const INVITE_LIMITS = { pollMs: 1_000, queueMs: 15 * 60_000 } as const;

export interface BrainstormDeps {
	/** Tell every window the brainstorm changed (null: it ended). */
	emit(brainstorm: Brainstorm | null): void;
	/** `herdr --session office agent prompt <agent> <text>`. */
	prompt(agent: string, text: string): Promise<void>;
	/** Only the chief of staff runs `office-brainstorm` from the shell. */
	chiefName(): string | undefined;
	/** What is on the whiteboard, one line per note or text. */
	boardText(): Promise<string>;
	sleep(ms: number): Promise<void>;
	now(): number;
}

/** The invitation each agent gets: the topic, the board so far, and how to post. */
export function invitation(brainstorm: Brainstorm, board: string): string {
	return [
		`Brainstorm with the office: "${brainstorm.topic}" (started by ${brainstorm.by}). Everyone is gathering at the whiteboard by the break-room sofa.`,
		`On the board now:\n${board.trim() || "(nothing yet)"}`,
		'Add one to three ideas, one per sticky note, from your bash tool: office-board note "<idea>" [--color yellow|green|blue|pink]. Run office-board read first to build on what others posted, not repeat it.',
		"Then carry on with your work; you head back to your desk when the brainstorm ends.",
	].join("\n\n");
}

/** Well-formed, recent requests among newly appended lines; anything else is skipped. */
export function parseBrainstormRequests(
	lines: readonly string[],
	now: number,
): BrainstormRequestLine[] {
	return lines.flatMap((line) => {
		let json: unknown;
		try {
			json = JSON.parse(line);
		} catch {
			return [];
		}
		const parsed = brainstormRequestLineSchema.safeParse(json);
		if (!parsed.success) return [];
		return now - Date.parse(parsed.data.requestedAt) <= REQUEST_MAX_AGE_MS ? [parsed.data] : [];
	});
}

/**
 * The office brainstorm: at most one at a time, started by Jeremy (HUD) or the
 * chief of staff (`office-brainstorm`). Every named agent takes part; each is
 * invited once it is free. Ending it only tells the windows: the agents' walk
 * back is theirs.
 */
export class BrainstormService {
	readonly #deps: BrainstormDeps;
	#current: Brainstorm | null = null;
	#snapshot: SessionSnapshot | undefined;
	/** Requests read before the first herdr snapshot: their authors come from it. */
	#early: string[] = [];
	#inviting: Promise<void> = Promise.resolve();

	constructor(deps: BrainstormDeps) {
		this.#deps = deps;
	}

	current(): Brainstorm | null {
		return this.#current;
	}

	/** Resolves once every invitation of the latest brainstorm is sent or given up on. */
	invited(): Promise<void> {
		return this.#inviting;
	}

	updateSnapshot(snapshot: SessionSnapshot): void {
		this.#snapshot = snapshot;
		if (this.#early.length === 0) return;
		const early = this.#early;
		this.#early = [];
		this.receive(early);
	}

	start(topic: string, by: string): Brainstorm {
		const agents = (this.#snapshot?.agents ?? []).flatMap((agent) => agent.name ?? []);
		const brainstorm: Brainstorm = {
			id: randomUUID(),
			topic: brainstormTopicSchema.parse(topic),
			startedAt: this.#deps.now(),
			by,
			agents,
		};
		this.#current = brainstorm;
		this.#deps.emit(brainstorm);
		this.#inviting = this.#invite(brainstorm).catch((error: unknown) =>
			log.warn("invitations failed", { error }),
		);
		return brainstorm;
	}

	end(): void {
		if (!this.#current) return;
		this.#current = null;
		this.#deps.emit(null);
	}

	/** New lines from the brainstorm-requests file; only the chief's count. */
	receive(lines: readonly string[]): void {
		if (!this.#snapshot) {
			this.#early.push(...lines);
			return;
		}
		for (const request of parseBrainstormRequests(lines, this.#deps.now())) {
			const by = this.#snapshot.agents.find((agent) => agent.pane_id === request.fromPane)?.name;
			if (!by || by !== this.#deps.chiefName()) {
				log.warn("brainstorm request refused: only the chief of staff runs one", { by });
				continue;
			}
			if (request.op === "start") this.start(request.topic, by);
			else this.end();
		}
	}

	async #invite(brainstorm: Brainstorm): Promise<void> {
		const text = invitation(brainstorm, await this.#deps.boardText());
		const guests = brainstorm.agents.filter((agent) => agent !== brainstorm.by);
		await Promise.all(guests.map((agent) => this.#inviteOne(agent, text, brainstorm.id)));
	}

	async #inviteOne(agent: string, text: string, id: string): Promise<void> {
		const wait: FreeWaitDeps = {
			statusOf: (name) => this.#snapshot?.agents.find((live) => live.name === name)?.agent_status,
			sleep: this.#deps.sleep,
			now: this.#deps.now,
		};
		const free = await whenFree(agent, wait, INVITE_LIMITS);
		// Ended, or replaced by another topic, while the agent was busy.
		if (this.#current?.id !== id) return;
		if (free !== "ready") {
			log.info("not invited", { agent, reason: free });
			return;
		}
		await this.#deps
			.prompt(agent, text)
			.catch((error: unknown) => log.warn("invitation not sent", { agent, error }));
	}
}
