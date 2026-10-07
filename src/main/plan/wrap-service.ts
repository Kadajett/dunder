import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createLogger } from "@shared/log/logger";
import type { DayPlan } from "@shared/plan";
import type { TryCounts } from "@shared/whats-new";
import { type WorkBoard, workLanes } from "@shared/work-board";
import { type DayWrap, wrapInputSchema } from "@shared/wrap";
import { z } from "zod";
import { dailyTimeSchema, isDailyDue, localDateKey } from "../calisthenics/schedule";
import { appendResultLine } from "../switchboard/results-file";
import { parseOfficePlanRequests } from "./requests";
import { dayFacts, eveningPrompt } from "./wrap";

const log = createLogger("wrap");

const CHECK_MS = 30_000;

/** `<userData>/evening-wrap.json`: when Max is asked to close the day, and the day he last was. */
const stateSchema = z.object({
	eveningTime: dailyTimeSchema.default("18:00"),
	lastPromptDate: z.string().optional(),
});
type WrapState = z.infer<typeof stateSchema>;

/** A stored wrap-up (our own file, read back defensively). */
const storedWrapSchema = z.object({
	date: z.string(),
	postedAt: z.number(),
	input: wrapInputSchema,
	planned: z.array(
		z.object({
			bead: z.string(),
			who: z.string(),
			title: z.string().nullable(),
			lane: z.enum(workLanes).nullable(),
		}),
	),
	unplanned: z.array(z.object({ id: z.string(), title: z.string() })),
	spendUsd: z.number().nullable(),
	// Wrap-ups written before the counts existed read as unknown.
	tries: z
		.object({ offered: z.number(), rated: z.number(), untried: z.number() })
		.nullable()
		.default(null),
	dismissed: z.boolean(),
}) satisfies z.ZodType<DayWrap>;

/** A day's wrap-up file, or null when there is none (or it's unreadable). */
export async function readWrap(plansDir: string, date: string): Promise<DayWrap | null> {
	const text = await readFile(join(plansDir, `${date}-wrap.json`), "utf8").catch(() => null);
	if (text === null) return null;
	try {
		const parsed = storedWrapSchema.safeParse(JSON.parse(text));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export interface WrapDeps {
	readonly statePath: string;
	readonly plansDir: string;
	/** Today's wrap-up as JSON, for `office-plan show`. */
	readonly digestPath: string;
	readonly resultsPath: string;
	readonly now: () => number;
	/** Say it to Max in the chief chat; `call`: as a call turn, so his answer is spoken. */
	readonly tellChief: (text: string, call: boolean) => Promise<boolean>;
	/** Jeremy is on a call with Max right now. */
	readonly callLive: () => boolean;
	readonly chiefPane: () => string | undefined;
	readonly plan: () => DayPlan | null;
	readonly board: () => Promise<WorkBoard>;
	readonly closedSince: (
		since: number,
	) => Promise<readonly { readonly id: string; readonly title: string }[]>;
	readonly spendToday: () => number | null;
	/** Today's 'Try these' and how Jeremy rated them (What's new); null when unknown. */
	readonly tryCounts: () => Promise<TryCounts | null>;
	readonly emit: (wrap: DayWrap | null) => void;
}

/**
 * The evening wrap-up in main: asks Max to close the day at the evening time
 * (once a day, catching up within two hours), takes his `office-plan wrap`,
 * and joins in the day's facts before Jeremy sees it.
 */
export class WrapService {
	readonly #deps: WrapDeps;
	#state: WrapState = stateSchema.parse({});
	#wrap: DayWrap | null = null;
	#timer: NodeJS.Timeout | undefined;
	#checking = false;

	constructor(deps: WrapDeps) {
		this.#deps = deps;
	}

	async start(): Promise<void> {
		this.#state = await readFile(this.#deps.statePath, "utf8").then(
			(text) => stateSchema.safeParse(JSON.parse(text)).data ?? stateSchema.parse({}),
			() => stateSchema.parse({}),
		);
		await this.#saveState();
		await mkdir(this.#deps.plansDir, { recursive: true });
		this.#wrap = await readWrap(this.#deps.plansDir, this.#today());
		await this.#writeDigest();
		this.#timer = setInterval(() => void this.check(), CHECK_MS);
		await this.check();
	}

	stop(): void {
		clearInterval(this.#timer);
	}

	today(): DayWrap | null {
		return this.#wrap?.date === this.#today() ? this.#wrap : null;
	}

	async dismiss(): Promise<void> {
		const wrap = this.today();
		if (wrap && !wrap.dismissed) await this.#set({ ...wrap, dismissed: true });
	}

	/** The clock's part: a new day, and the evening prompt. */
	async check(): Promise<void> {
		if (this.#checking) return;
		this.#checking = true;
		try {
			if (this.#wrap && this.#wrap.date !== this.#today()) await this.#set(null);
			await this.#promptIfDue();
		} catch (error) {
			log.warn("evening wrap-up check failed", { error });
		} finally {
			this.#checking = false;
		}
	}

	async #promptIfDue(): Promise<void> {
		const now = new Date(this.#deps.now());
		if (!isDailyDue(now, this.#state.eveningTime, this.#state.lastPromptDate) || this.today())
			return;
		const prompt = eveningPrompt(await this.#facts());
		if (!(await this.#deps.tellChief(prompt, this.#deps.callLive()))) return;
		this.#state = { ...this.#state, lastPromptDate: localDateKey(now) };
		await this.#saveState();
		log.info("asked the chief for the evening wrap-up");
	}

	async #facts() {
		const startOfDay = new Date(this.#deps.now()).setHours(0, 0, 0, 0);
		const [board, closed] = await Promise.all([
			this.#deps.board(),
			this.#deps.closedSince(startOfDay).catch(() => []),
		]);
		const tries = await this.#deps.tryCounts().catch(() => null);
		return dayFacts(this.#deps.plan(), board, closed, { spendUsd: this.#deps.spendToday(), tries });
	}

	/** New `office-plan` request lines (the day cycle tails the requests file for both services). */
	async receive(lines: readonly string[]): Promise<void> {
		const { valid, invalid } = parseOfficePlanRequests(
			lines,
			this.#deps.now(),
			"wrap",
			wrapInputSchema,
		);
		for (const { id, error } of invalid)
			await this.#answer(id, false, `not a valid wrap-up:\n${error}`);
		for (const request of valid) {
			if (request.fromPane !== this.#deps.chiefPane()) {
				await this.#answer(
					request.id,
					false,
					"only the chief of staff writes the wrap-up; nothing was stored",
				);
				continue;
			}
			const facts = await this.#facts();
			await this.#set({
				date: this.#today(),
				postedAt: this.#deps.now(),
				input: request.body,
				...facts,
				dismissed: false,
			});
			await this.#answer(
				request.id,
				true,
				"today's wrap-up is posted; Jeremy sees it now, and tomorrow's morning prompt starts from your proposals.",
			);
		}
	}

	async #answer(id: string, ok: boolean, message: string): Promise<void> {
		await appendResultLine(this.#deps.resultsPath, JSON.stringify({ id, ok, message })).catch(
			(error: unknown) => log.warn("cannot answer a wrap-up request", { error }),
		);
	}

	async #set(wrap: DayWrap | null): Promise<void> {
		this.#wrap = wrap;
		this.#deps.emit(wrap);
		if (wrap)
			await writeFile(
				join(this.#deps.plansDir, `${wrap.date}-wrap.json`),
				`${JSON.stringify(wrap, null, "\t")}\n`,
			);
		await this.#writeDigest();
	}

	async #saveState(): Promise<void> {
		await writeFile(this.#deps.statePath, `${JSON.stringify(this.#state, null, "\t")}\n`).catch(
			(error: unknown) => log.warn("cannot save the wrap-up state", { error }),
		);
	}

	async #writeDigest(): Promise<void> {
		await mkdir(dirname(this.#deps.digestPath), { recursive: true });
		await writeFile(
			this.#deps.digestPath,
			`${JSON.stringify({ date: this.#today(), wrap: this.today() })}\n`,
		).catch((error: unknown) => log.warn("cannot write the wrap-up digest", { error }));
	}

	#today(): string {
		return localDateKey(new Date(this.#deps.now()));
	}
}
