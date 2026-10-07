import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createLogger } from "@shared/log/logger";
import { type DayPlan, type PlanProposal, type PlanResult, planProposalSchema } from "@shared/plan";
import { z } from "zod";
import { isDailyDue, localDateKey } from "../calisthenics/schedule";
import { type MailboxTail, tailMailbox } from "../switchboard/mailbox";
import {
	approvePlan,
	discussPlan,
	editPlan,
	goAheadIfDue,
	MORNING_PROMPT,
	type PlanStep,
	proposePlan,
} from "./day-plan";
import { parsePlanRequests } from "./requests";
import { loadPlanSettings, type PlanSettings, savePlanSettings } from "./settings";

const log = createLogger("plan");

const CHECK_MS = 30_000;

export interface PlanDeps {
	/** `<userData>/morning-plan.json` */
	readonly settingsPath: string;
	/** `<userData>/plans`: one `<date>.json` per day. */
	readonly plansDir: string;
	/** Where `office-plan show` reads today's plan. */
	readonly digestPath: string;
	readonly requestsPath: string;
	readonly resultsPath: string;
	readonly now: () => number;
	/** Say it to Max in the chief chat (sent now, or queued until he's free); false when there's no chief. */
	readonly tellChief: (text: string) => Promise<boolean>;
	/** Added to the morning prompt: yesterday's wrap-up proposals ('' when there are none). */
	readonly morningContext: () => Promise<string>;
	/** Max's live pane: only he can propose the plan. */
	readonly chiefPane: () => string | undefined;
	readonly emit: (plan: DayPlan | null) => void;
}

/** A stored day plan (our own file, but read back defensively). */
const dayPlanSchema = z.object({
	date: z.string(),
	proposal: planProposalSchema,
	proposedAt: z.number(),
	state: z.enum(["proposed", "approved", "edited", "auto"]),
	decidedAt: z.number().nullable(),
	edited: planProposalSchema.nullable(),
	goAheadAt: z.number().nullable(),
}) satisfies z.ZodType<DayPlan>;

/**
 * The morning plan in main: asks Max for the day's plan at the daily time
 * (once a day, catching up on a later launch), takes his `office-plan propose`,
 * and keeps Jeremy's decision, telling Max each one, or going ahead for him
 * after the hour.
 */
export class PlanService {
	readonly #deps: PlanDeps;
	#settings: PlanSettings | undefined;
	#plan: DayPlan | null = null;
	#timer: NodeJS.Timeout | undefined;
	#tail: MailboxTail | undefined;
	#checking = false;

	constructor(deps: PlanDeps) {
		this.#deps = deps;
	}

	async start(): Promise<void> {
		this.#settings = await loadPlanSettings(this.#deps.settingsPath);
		await mkdir(this.#deps.plansDir, { recursive: true });
		await savePlanSettings(this.#deps.settingsPath, this.#settings);
		this.#plan = await this.#load(this.#today());
		await this.#writeDigest();
		// Requests made while the app was closed are stale: start at the file's end.
		const offset = await stat(this.#deps.requestsPath).then(
			(info) => info.size,
			() => 0,
		);
		this.#tail = await tailMailbox({
			path: this.#deps.requestsPath,
			offset,
			onLines: (lines) => void this.#receive(lines),
			onError: (error) => log.warn("cannot read plan requests", { error }),
		});
		this.#timer = setInterval(() => void this.check(), CHECK_MS);
		await this.check();
	}

	stop(): void {
		clearInterval(this.#timer);
		this.#tail?.stop();
	}

	today(): DayPlan | null {
		return this.#plan?.date === this.#today() ? this.#plan : null;
	}

	approve(): Promise<PlanResult> {
		return this.#decide((plan) => approvePlan(plan, this.#deps.now()));
	}

	edit(edit: PlanProposal): Promise<PlanResult> {
		return this.#decide((plan) => editPlan(plan, edit, this.#deps.now()));
	}

	discuss(): Promise<PlanResult> {
		return this.#decide(discussPlan);
	}

	/** The clock's part: a new day, the morning prompt, Max going ahead without a decision. */
	async check(): Promise<void> {
		if (this.#checking || !this.#settings) return;
		this.#checking = true;
		try {
			if (this.#plan && this.#plan.date !== this.#today()) await this.#set(null);
			await this.#promptIfDue(this.#settings);
			const plan = this.today();
			const step = plan && goAheadIfDue(plan, this.#deps.now(), this.#settings.proceedAfterMinutes);
			if (step?.ok) await this.#apply(step);
		} catch (error) {
			log.warn("morning plan check failed", { error });
		} finally {
			this.#checking = false;
		}
	}

	async #promptIfDue(settings: PlanSettings): Promise<void> {
		const now = new Date(this.#deps.now());
		if (!isDailyDue(now, settings.dailyTime, settings.lastPromptDate) || this.today()) return;
		const prompt = MORNING_PROMPT + (await this.#deps.morningContext());
		if (!(await this.#deps.tellChief(prompt))) return;
		this.#settings = { ...settings, lastPromptDate: localDateKey(now) };
		await savePlanSettings(this.#deps.settingsPath, this.#settings);
		log.info("asked the chief for today's plan");
	}

	async #decide(step: (plan: DayPlan) => PlanStep): Promise<PlanResult> {
		const plan = this.today();
		if (!plan) return { ok: false, error: "there is no plan today" };
		const next = step(plan);
		if (!next.ok) return next;
		await this.#apply(next);
		return { ok: true };
	}

	async #apply(step: Extract<PlanStep, { ok: true }>): Promise<void> {
		await this.#set(step.plan);
		if (step.tell && !(await this.#deps.tellChief(step.tell))) {
			log.warn("the chief wasn't told about the plan", { tell: step.tell });
		}
	}

	async #receive(lines: readonly string[]): Promise<void> {
		const { valid, invalid } = parsePlanRequests(lines, this.#deps.now());
		for (const { id, error } of invalid)
			await this.#answer(id, false, `not a valid plan:\n${error}`);
		for (const request of valid) {
			if (request.fromPane !== this.#deps.chiefPane()) {
				await this.#answer(
					request.id,
					false,
					"only the chief of staff proposes the plan; nothing was stored",
				);
				continue;
			}
			const settings = this.#settings ?? (await loadPlanSettings(this.#deps.settingsPath));
			const plan = proposePlan(
				this.#today(),
				request.body,
				this.#deps.now(),
				settings.proceedAfterMinutes,
			);
			await this.#set(plan);
			const at = new Date(plan.goAheadAt ?? 0).toTimeString().slice(0, 5);
			await this.#answer(
				request.id,
				true,
				`today's plan is proposed; Jeremy sees it now. You go ahead at ${at} unless he decides first.`,
			);
		}
	}

	async #answer(id: string, ok: boolean, message: string): Promise<void> {
		await mkdir(dirname(this.#deps.resultsPath), { recursive: true });
		await appendFile(this.#deps.resultsPath, `${JSON.stringify({ id, ok, message })}\n`).catch(
			(error: unknown) => log.warn("cannot answer a plan request", { error }),
		);
	}

	async #set(plan: DayPlan | null): Promise<void> {
		this.#plan = plan;
		this.#deps.emit(plan);
		if (plan)
			await writeFile(
				join(this.#deps.plansDir, `${plan.date}.json`),
				`${JSON.stringify(plan, null, "\t")}\n`,
			);
		await this.#writeDigest();
	}

	async #load(date: string): Promise<DayPlan | null> {
		const text = await readFile(join(this.#deps.plansDir, `${date}.json`), "utf8").catch(
			() => null,
		);
		if (text === null) return null;
		try {
			return dayPlanSchema.parse(JSON.parse(text));
		} catch (error) {
			log.warn("today's plan file is unreadable; starting without it", { date, error });
			return null;
		}
	}

	async #writeDigest(): Promise<void> {
		const digest = { date: this.#today(), plan: this.today() };
		await mkdir(dirname(this.#deps.digestPath), { recursive: true });
		await writeFile(this.#deps.digestPath, `${JSON.stringify(digest)}\n`).catch((error: unknown) =>
			log.warn("cannot write the plan digest", { error }),
		);
	}

	#today(): string {
		return localDateKey(new Date(this.#deps.now()));
	}
}
