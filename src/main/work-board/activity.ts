import { readFile } from "node:fs/promises";
import { createLogger } from "@shared/log/logger";
import type { WorkCard } from "@shared/work-board";
import { z } from "zod";
import type { Bead } from "./cards";
import { writeAtomic } from "./shipping";

const log = createLogger("work-board");

const entrySchema = z.object({ key: z.string(), at: z.number() });
type Entry = z.infer<typeof entrySchema>;

/** What a label or comment changes on an in-progress bead (bd moves no `updated_at` for those). */
const activityKey = (bead: Bead): string =>
	`${[...(bead.labels ?? [])].sort().join(",")}#${bead.comment_count ?? 0}`;

/**
 * When each in-progress bead last got a label or comment. bd 1.1.2 doesn't
 * bump `updated_at` for those, so the board notes it as it watches: a bead
 * first seen counts from its last update; a changed key, from now. Beads that
 * leave In progress drop out.
 */
export function noteActivity(
	before: ReadonlyMap<string, Entry>,
	beads: readonly Bead[],
	now: number,
): Map<string, Entry> {
	const next = new Map<string, Entry>();
	for (const bead of beads) {
		if (bead.status !== "in_progress") continue;
		const key = activityKey(bead);
		const seen = before.get(bead.id);
		if (seen?.key === key) next.set(bead.id, seen);
		else next.set(bead.id, { key, at: seen ? now : Date.parse(bead.updated_at) || now });
	}
	return next;
}

/** In-progress cards updated as of their latest activity (a label or comment counts as an update). */
export function withActivity(
	cards: readonly WorkCard[],
	activity: ReadonlyMap<string, Entry>,
): WorkCard[] {
	return cards.map((card) => {
		const at = activity.get(card.id)?.at;
		if (card.lane !== "in_progress" || at === undefined) return card;
		return at > (Date.parse(card.updatedAt) || 0)
			? { ...card, updatedAt: new Date(at).toISOString() }
			: card;
	});
}

const fileSchema = z.record(z.string(), entrySchema);

/** `noteActivity` kept in a file, so a restart doesn't forget a label added while it ran. */
export class ActivityClock {
	readonly #path: string;
	#entries = new Map<string, Entry>();
	#saved = "";
	#loaded: Promise<void>;

	constructor(path: string) {
		this.#path = path;
		this.#loaded = readFile(path, "utf8")
			.then((text) => {
				this.#saved = text.trim();
				this.#entries = new Map(Object.entries(fileSchema.parse(JSON.parse(text))));
			})
			.catch(() => undefined);
	}

	/** Update from the beads just read; returns `cards` with their activity applied. */
	async observe(
		cards: readonly WorkCard[],
		beads: readonly Bead[],
		now: number,
	): Promise<WorkCard[]> {
		await this.#loaded;
		this.#entries = noteActivity(this.#entries, beads, now);
		const text = JSON.stringify(Object.fromEntries(this.#entries));
		if (text !== this.#saved) {
			this.#saved = text;
			await writeAtomic(this.#path, text).catch((error: unknown) =>
				log.warn("cannot save bead activity", { error }),
			);
		}
		return withActivity(cards, this.#entries);
	}
}
