import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { IPC } from "@shared/ipc";
import { createLogger } from "@shared/log/logger";
import { planProposalSchema } from "@shared/plan";
import { ipcMain } from "electron";
import { localDateKey } from "../calisthenics/schedule";
import type { ChiefService } from "../chief/chief-service";
import type { OfficeBridge } from "../herdr/office-bridge";
import type { CostTracker } from "../office-stats/cost-tracker";
import { type MailboxTail, tailMailbox } from "../switchboard/mailbox";
import type { CallKeeper } from "../voice/call-keeper";
import type { WhatsNewService } from "../whats-new/service";
import type { WorkBoardService } from "../work-board/service";
import {
	officePlanDigestPath,
	officePlanRequestsPath,
	officePlanResultsPath,
	officeWrapDigestPath,
} from "./requests";
import { PlanService } from "./service";
import { morningContext } from "./wrap";
import { readWrap, WrapService } from "./wrap-service";

const log = createLogger("plan");

export interface DayCycleOptions {
	readonly userData: string;
	readonly chief: Pick<ChiefService, "send" | "status">;
	readonly bridge: () => Pick<OfficeBridge, "latest"> | undefined;
	readonly workBoard: Pick<WorkBoardService, "get" | "closedSince">;
	readonly cost: Pick<CostTracker, "current">;
	readonly calls: Pick<CallKeeper, "live">;
	/** Today's 'Try these' counts for the wrap-up (What's new). */
	readonly tries: Pick<WhatsNewService, "tryCounts">;
	/** Send to every window (plan and wrap-up changes). */
	readonly broadcast: (channel: string, payload: unknown) => void;
}

/** The office's day: the morning plan, and the evening wrap-up that closes it. */
export interface DayCycle {
	readonly plan: PlanService;
	readonly wrap: WrapService;
	start(): Promise<void>;
	stop(): void;
}

const yesterday = (now: number): string => {
	const date = new Date(now);
	date.setDate(date.getDate() - 1);
	return localDateKey(date);
};

/**
 * The one reader of the `office-plan` requests file (it rotates it, so there
 * must be only one), handing each batch to every service. Requests made while
 * the app was closed are stale, so it starts at the file's end.
 */
async function tailPlanRequests(
	path: string,
	services: readonly { receive(lines: readonly string[]): Promise<void> }[],
): Promise<MailboxTail> {
	const offset = await stat(path).then(
		(info) => info.size,
		() => 0,
	);
	return tailMailbox({
		path,
		offset,
		onLines: (lines) => {
			for (const service of services) if (lines.length > 0) void service.receive(lines);
		},
		onError: (error) => log.warn("cannot read plan requests", { error }),
	});
}

/** The morning plan and the evening wrap-up, talking to Max through the chief chat and taking `office-plan` requests. */
export function createPlan(options: DayCycleOptions): DayCycle {
	const { chief } = options;
	const plansDir = join(options.userData, "plans");
	const requestsPath = officePlanRequestsPath(process.env, homedir());
	const files = {
		plansDir,
		resultsPath: officePlanResultsPath(process.env, homedir()),
		now: Date.now,
		chiefPane: () => {
			const name = chief.status()?.name;
			return options
				.bridge()
				?.latest()
				?.agents.find((agent) => agent.name === name)?.pane_id;
		},
	};
	const plan = new PlanService({
		...files,
		settingsPath: join(options.userData, "morning-plan.json"),
		digestPath: officePlanDigestPath(process.env, homedir()),
		tellChief: async (text) => (await chief.send(text)).state !== "rejected",
		morningContext: async () => morningContext(await readWrap(plansDir, yesterday(Date.now()))),
		emit: (today) => options.broadcast(IPC.planChanged, today),
	});
	const wrap = new WrapService({
		...files,
		statePath: join(options.userData, "evening-wrap.json"),
		digestPath: officeWrapDigestPath(process.env, homedir()),
		tellChief: async (text, call) => (await chief.send(text, call)).state !== "rejected",
		callLive: () => options.calls.live(),
		plan: () => plan.today(),
		board: () => options.workBoard.get(),
		closedSince: (since) => options.workBoard.closedSince(since),
		spendToday: () => {
			const cost = options.cost.current();
			return cost.state === "ok" ? cost.usd : null;
		},
		tryCounts: () => options.tries.tryCounts(),
		emit: (today) => options.broadcast(IPC.wrapChanged, today),
	});
	let tail: MailboxTail | undefined;
	return {
		plan,
		wrap,
		start: async () => {
			await plan.start();
			await wrap.start();
			tail = await tailPlanRequests(requestsPath, [plan, wrap]);
		},
		stop: () => {
			tail?.stop();
			plan.stop();
			wrap.stop();
		},
	};
}

/** `window.office.plan` and `window.office.wrap` handlers. An edit from the renderer is untrusted. */
export function registerPlanIpc({ plan, wrap }: DayCycle): void {
	ipcMain.handle(IPC.planToday, () => plan.today());
	ipcMain.handle(IPC.planApprove, () => plan.approve());
	ipcMain.handle(IPC.planEdit, (_event, edit: unknown) => {
		const parsed = planProposalSchema.safeParse(edit);
		return parsed.success ? plan.edit(parsed.data) : { ok: false, error: "not a valid plan" };
	});
	ipcMain.handle(IPC.planDiscuss, () => plan.discuss());
	ipcMain.handle(IPC.wrapToday, () => wrap.today());
	ipcMain.handle(IPC.wrapDismiss, () => wrap.dismiss());
}
