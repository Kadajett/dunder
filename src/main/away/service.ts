import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AwaySummary } from "@shared/away";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";
import { type Absence, type AwayFacts, absenceStart, awaySummary, isBack } from "./summary";

const log = createLogger("away");

const absenceSchema = z.object({ awayAt: z.number(), build: z.string().nullable() }).nullable();

export interface AwayDeps {
	/** Where the absence is kept, so an update relaunch while he is away doesn't forget it. */
	readonly statePath: string;
	readonly now: () => number;
	/** Dunder's window has focus. */
	readonly focused: () => boolean;
	/** How long the machine has had no input (ms). */
	readonly idleMs: () => number;
	/** The running build's commit; null under the dev server. */
	readonly build: string | null;
	/** What happened between `awayAt` and `now` (`fromBuild`: the build running when he left). */
	readonly facts: (awayAt: number, now: number, fromBuild: string | null) => Promise<AwayFacts>;
	readonly emit: (summary: AwaySummary) => void;
}

/**
 * Notices Jeremy leaving (window in the background, or the machine idle for
 * 2 h) and coming back, and then sums up what happened in between.
 */
export class AwayService {
	readonly #deps: AwayDeps;
	#absence: Absence | null = null;
	#pending: AwaySummary | null = null;
	#loaded: Promise<void> | undefined;
	#checking = false;

	constructor(deps: AwayDeps) {
		this.#deps = deps;
	}

	/** Read an absence that outlived the last run (e.g. an update relaunched the app while he was away). */
	start(): Promise<void> {
		this.#loaded ??= readFile(this.#deps.statePath, "utf8")
			.then((text) => {
				this.#absence = absenceSchema.parse(JSON.parse(text));
			})
			.catch(() => undefined);
		return this.#loaded;
	}

	get(): AwaySummary | null {
		return this.#pending;
	}

	dismiss(): void {
		this.#pending = null;
	}

	/** Look at focus and idle time now: start an absence, or end one and sum it up. */
	async check(): Promise<void> {
		await this.start();
		if (this.#checking) return;
		this.#checking = true;
		try {
			await this.#step();
		} catch (error) {
			log.warn("away check failed", { error });
		} finally {
			this.#checking = false;
		}
	}

	async #step(): Promise<void> {
		const signal = {
			focused: this.#deps.focused(),
			idleMs: this.#deps.idleMs(),
			now: this.#deps.now(),
		};
		const absence = this.#absence;
		if (absence && isBack(signal)) {
			await this.#save(null);
			const facts = await this.#deps.facts(absence.awayAt, signal.now, absence.build);
			const summary = awaySummary(absence.awayAt, signal.now, facts);
			if (!summary) return;
			this.#pending = summary;
			this.#deps.emit(summary);
			return;
		}
		const awayAt = absenceStart(absence, signal);
		if (awayAt !== null && !absence) await this.#save({ awayAt, build: this.#deps.build });
	}

	/** Written before the step finishes, so a relaunch right after still knows. */
	async #save(absence: Absence | null): Promise<void> {
		this.#absence = absence;
		const path = this.#deps.statePath;
		await mkdir(dirname(path), { recursive: true })
			.then(() => writeFile(path, `${JSON.stringify(absence)}\n`, "utf8"))
			.catch((error: unknown) => log.warn("could not save the absence", { error }));
	}
}
