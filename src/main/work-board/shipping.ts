import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createLogger } from "@shared/log/logger";
import type { ShippingStats, WorkCard } from "@shared/work-board";
import { z } from "zod";
import { type Bead, isEpic, isHumanAsk } from "./cards";
import { beadSpend, type SpendOf } from "./spend";

const log = createLogger("work-board");

/** Review entries are kept this long after the bead leaves Review (closed beads need theirs today and tomorrow). */
const REVIEW_KEEP_MS = 3 * 24 * 60 * 60 * 1000;

export function median(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	const upper = sorted[middle] ?? 0;
	return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2;
}

/** Local midnight of `now`'s day, and of the day before. */
function dayStarts(now: number): { readonly today: number; readonly yesterday: number } {
	const midnight = new Date(now);
	midnight.setHours(0, 0, 0, 0);
	const yesterday = new Date(midnight);
	yesterday.setDate(yesterday.getDate() - 1);
	return { today: midnight.getTime(), yesterday: yesterday.getTime() };
}

const time = (iso: string | null | undefined): number | null => {
	const ms = Date.parse(iso ?? "");
	return Number.isFinite(ms) ? ms : null;
};

export interface ShippingInput {
	/** Beads closed recently (the board's 30-day read). */
	readonly closed: readonly Bead[];
	readonly cards: readonly WorkCard[];
	/** Bead id → when it entered Review (epoch ms). */
	readonly reviewSince: ReadonlyMap<string, number>;
	readonly spendOf: SpendOf;
	readonly now: number;
}

/** Today's shipping figures from the board's beads. */
export function shippingStats({
	closed,
	cards,
	reviewSince,
	spendOf,
	now,
}: ShippingInput): ShippingStats {
	const days = dayStarts(now);
	const work = closed.filter((bead) => !isEpic(bead) && !isHumanAsk(bead));
	const closedAt = (bead: Bead) => time(bead.closed_at) ?? 0;
	const today = work.filter((bead) => closedAt(bead) >= days.today);
	const yesterday = work.filter(
		(bead) => closedAt(bead) >= days.yesterday && closedAt(bead) < days.today,
	);
	const leads = today.flatMap((bead) => {
		const start = time(bead.started_at);
		return start === null ? [] : [closedAt(bead) - start];
	});
	const reviews = today.flatMap((bead) => {
		const since = reviewSince.get(bead.id);
		return since === undefined || since > closedAt(bead) ? [] : [closedAt(bead) - since];
	});
	const costs = today.flatMap((bead) => beadSpend(bead, spendOf, now) ?? []);
	return {
		today: today.length,
		yesterday: yesterday.length,
		leadMs: median(leads),
		reviewMs: median(reviews),
		usd: median(costs),
		ready: cards.filter((card) => card.lane === "ready").length,
		inReview: cards.filter((card) => card.lane === "review").length,
	};
}

/**
 * When each bead entered Review. bd keeps no label history, so the board
 * notes it as it watches: first seen in Review (a bead already there at
 * launch counts from its last update, as the card's 'waiting' line does).
 * Sent back out of Review, the entry goes; closed, it stays for the stats.
 */
export function noteReview(
	since: ReadonlyMap<string, number>,
	cards: readonly WorkCard[],
	now: number,
): Map<string, number> {
	const lanes = new Map(cards.map((card) => [card.id, card]));
	const next = new Map<string, number>();
	for (const [id, at] of since) {
		const lane = lanes.get(id)?.lane;
		const reopened = lane !== undefined && lane !== "review" && lane !== "done";
		if (!reopened && now - at < REVIEW_KEEP_MS) next.set(id, at);
	}
	for (const card of cards) {
		if (card.lane !== "review" || next.has(card.id)) continue;
		next.set(card.id, Math.min(now, time(card.updatedAt) ?? now));
	}
	return next;
}

const reviewFileSchema = z.record(z.string(), z.number());

/** `noteReview` kept in a file, so a restart doesn't forget who is waiting since when. */
export class ReviewClock {
	readonly #path: string;
	#since = new Map<string, number>();
	#saved = "";
	#loaded: Promise<void>;

	constructor(path: string) {
		this.#path = path;
		this.#loaded = readFile(path, "utf8")
			.then((text) => {
				this.#saved = text.trim();
				this.#since = new Map(Object.entries(reviewFileSchema.parse(JSON.parse(text))));
			})
			.catch(() => undefined);
	}

	/** Update from the board just read; returns the entries. */
	async observe(cards: readonly WorkCard[], now: number): Promise<ReadonlyMap<string, number>> {
		await this.#loaded;
		this.#since = noteReview(this.#since, cards, now);
		const text = JSON.stringify(Object.fromEntries(this.#since));
		if (text !== this.#saved) {
			this.#saved = text;
			await save(this.#path, text).catch((error: unknown) =>
				log.warn("cannot save review times", { error }),
			);
		}
		return this.#since;
	}
}

async function save(path: string, text: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${text}\n`, "utf8");
	await rename(temp, path);
}
