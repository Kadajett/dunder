import type { UpdateCommit } from "@shared/app-update";
import { displayTitle, isInternalOnly } from "@shared/change-notes.mts";
import { createLogger } from "@shared/log/logger";
import {
	WHATS_NEW_RECENT,
	type WhatsNew,
	type WhatsNewBead,
	type WhatsNewRating,
	type WhatsNewResult,
} from "@shared/whats-new";
import type { WorkResult } from "@shared/work-board";
import {
	type BuildHistory,
	beadsOfCommits,
	type CommitBead,
	type CommitBeads,
	planCard,
	tryItOf,
} from "./card";
import { readWhatsNewState, type WhatsNewState, writeWhatsNewState } from "./state";

const log = createLogger("whats-new");

export interface BeadDetail {
	readonly id: string;
	readonly title: string;
	readonly notes?: string | undefined;
	readonly issue_type?: string | undefined;
}

export interface WhatsNewDeps {
	/** The running build's commit; undefined under the dev server. */
	readonly built: string | undefined;
	readonly statePath: string;
	readonly git: {
		isAncestor(from: string, to: string): Promise<boolean>;
		/** `git log` over a range or with options, newest first. */
		log(args: readonly string[]): Promise<readonly UpdateCommit[]>;
		/** Files changed per bead over the same range or options (`pathsByBead`). */
		paths(args: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>>;
	};
	/** Title and notes per bead; bd leaves out ids it doesn't know. Throws when bd fails. */
	readonly details: (ids: readonly string[]) => Promise<readonly BeadDetail[]>;
	/** A bd comment on the bead, authored by Jeremy. */
	readonly comment: (id: string, text: string) => Promise<WorkResult>;
	/** Tell the chief of staff, as Jeremy's chat message. */
	readonly tellChief: (
		text: string,
	) => Promise<{ readonly state: string; readonly reason?: string }>;
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The card after Dunder relaunches on a new commit: the beads merged since
 * the last build Jeremy dismissed, each with its try-it line and his thumbs.
 */
export class WhatsNewService {
	readonly #deps: WhatsNewDeps;
	#card: Promise<WhatsNew | null> | undefined;
	#state: WhatsNewState | undefined;
	/** Ratings run one at a time, so each builds on the card the last one left. */
	#rating: Promise<unknown> = Promise.resolve();

	constructor(deps: WhatsNewDeps) {
		this.#deps = deps;
	}

	/** Built once per launch; null when there is nothing to show. */
	get(): Promise<WhatsNew | null> {
		this.#card ??= this.#build().catch((error: unknown) => {
			log.warn("no what's new card", { error });
			return null;
		});
		return this.#card;
	}

	async dismiss(): Promise<void> {
		const card = await this.get();
		if (!card) return;
		this.#card = Promise.resolve(null);
		await this.#save({ version: 1, lastSeenBuild: card.built, pending: null });
	}

	rate(id: string, rating: WhatsNewRating, text: string): Promise<WhatsNewResult> {
		const next = this.#rating.then(() => this.#rate(id, rating, text));
		this.#rating = next.catch(() => undefined);
		return next;
	}

	async #rate(id: string, rating: WhatsNewRating, text: string): Promise<WhatsNewResult> {
		const card = await this.get();
		const bead = card?.beads.find((candidate) => candidate.id === id);
		if (!card || !bead) return { ok: false, reason: "That bead isn't on the card" };
		if (card.ratingOff) return { ok: false, reason: card.ratingOff };
		const build = card.built.slice(0, 7);
		const note = rating === "up" ? `👍 after update ${build}` : `👎 after update ${build}`;
		const written = await this.#deps.comment(id, text ? `${note}: ${text}` : note);
		if (!written.ok) return written;
		if (rating === "down") await this.#tellChief(bead, text);
		const rated: WhatsNew = {
			...card,
			beads: card.beads.map((each) => (each.id === id ? { ...each, rating } : each)),
		};
		this.#card = Promise.resolve(rated);
		await this.#save(this.#pendingWith(rated));
		return { ok: true };
	}

	async #build(): Promise<WhatsNew | null> {
		const { built } = this.#deps;
		this.#state = await readWhatsNewState(this.#deps.statePath);
		const lastSeen = this.#state?.lastSeenBuild;
		const history =
			built !== undefined && lastSeen !== undefined && lastSeen !== built
				? await this.#history(lastSeen, built)
				: "apart";
		const plan = planCard(built, lastSeen, history);
		if (built === undefined || plan.kind === "none") return null;
		if (plan.kind === "first-launch") {
			await this.#save({ version: 1, lastSeenBuild: built, pending: null });
			return null;
		}
		const range =
			plan.kind === "since" ? [`${plan.from}..${built}`] : ["-n", String(WHATS_NEW_RECENT), built];
		const found = beadsOfCommits(await this.#deps.git.log(range));
		if (found.beads.length === 0 && found.others.length === 0) return null;
		const paths = await this.#deps.git.paths(range).catch((error: unknown) => {
			log.warn("no file lists for the what's new card", { error });
			return new Map<string, readonly string[]>();
		});
		const card = await this.#withDetails(built, found, paths);
		return { ...card, recent: plan.kind === "recent" };
	}

	/** How `built` relates to `lastSeen` in git history (see `BuildHistory`). */
	async #history(lastSeen: string, built: string): Promise<BuildHistory> {
		if (await this.#deps.git.isAncestor(lastSeen, built)) return "ahead";
		return (await this.#deps.git.isAncestor(built, lastSeen)) ? "behind" : "apart";
	}

	/** Titles and try-it lines from bd; without bd, the commit summaries with rating off. */
	async #withDetails(
		built: string,
		{ beads, others }: CommitBeads,
		paths: ReadonlyMap<string, readonly string[]>,
	): Promise<Omit<WhatsNew, "recent">> {
		const ratings = this.#state?.pending?.built === built ? this.#state.pending.ratings : {};
		const row = (bead: CommitBead, detail?: BeadDetail): WhatsNewBead => ({
			...bead,
			title: detail ? displayTitle(detail.title) : null,
			tryIt: tryItOf(detail?.notes),
			rating: ratings[bead.id] ?? null,
			type: detail?.issue_type ?? null,
			internal: isInternalOnly(paths.get(bead.id) ?? []),
		});
		try {
			const details = new Map(
				(await this.#deps.details(beads.map((b) => b.id))).map((d) => [d.id, d]),
			);
			// An id bd doesn't know was just a subject that looked like one.
			const known = beads.filter((bead) => details.has(bead.id));
			const unknown = beads.filter((bead) => !details.has(bead.id)).map((bead) => bead.subject);
			return {
				built,
				beads: known.map((bead) => row(bead, details.get(bead.id))),
				others: [...others, ...unknown],
				ratingOff: null,
			};
		} catch (error) {
			log.warn("bd unavailable for the what's new card", { error });
			const ratingOff = `Rating needs bd, which failed: ${reasonOf(error)}`.slice(0, 300);
			return { built, beads: beads.map((bead) => row(bead)), others, ratingOff };
		}
	}

	async #tellChief(bead: WhatsNewBead, text: string): Promise<void> {
		const what = bead.title ?? bead.subject;
		const result = await this.#deps
			.tellChief(`👎 ${bead.id} (${what}): ${text || "no details given"}`)
			.catch((error: unknown) => ({ state: "rejected", reason: reasonOf(error) }));
		if (result.state === "rejected")
			log.warn("thumbs down not sent to the chief", { id: bead.id, result });
	}

	#pendingWith(card: WhatsNew): WhatsNewState {
		const ratings = Object.fromEntries(
			card.beads.flatMap((bead) => (bead.rating ? [[bead.id, bead.rating]] : [])),
		);
		const lastSeenBuild = this.#state?.lastSeenBuild ?? card.built;
		return { version: 1, lastSeenBuild, pending: { built: card.built, ratings } };
	}

	async #save(state: WhatsNewState): Promise<void> {
		this.#state = state;
		await writeWhatsNewState(this.#deps.statePath, state).catch((error: unknown) =>
			log.warn("could not save what's new state", { error }),
		);
	}
}
