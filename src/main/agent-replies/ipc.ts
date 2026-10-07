import { INTERRUPT_REASON_MAX, type InterruptResult } from "@shared/agent-replies";
import { IPC } from "@shared/ipc";
import { ipcMain } from "electron";
import { z } from "zod";
import { officeArgs, runHerdr } from "../herdr/cli";
import { postToMailbox } from "../switchboard/service";
import { interruptAgent } from "./interrupt";
import type { AgentRepliesService } from "./service";

const nameSchema = z.string().min(1).max(200);
const reasonSchema = z.string().max(INTERRUPT_REASON_MAX);

/** `window.office.agents` handlers. `chiefName`: who hears about interrupts. */
export function registerAgentRepliesIpc(
	replies: AgentRepliesService,
	chiefName: () => string | undefined,
): void {
	ipcMain.handle(IPC.agentsLastReply, (_event, name: unknown) =>
		replies.lastReply(nameSchema.parse(name)),
	);
	const deps = {
		cli: (args: readonly string[], timeoutMs?: number) => runHerdr(officeArgs(args), timeoutMs),
		chiefName,
		tell: postToMailbox,
	};
	ipcMain.handle(
		IPC.agentsInterrupt,
		(_event, name: unknown, reason: unknown): Promise<InterruptResult> => {
			const parsed = z.tuple([nameSchema, reasonSchema]).safeParse([name, reason]);
			if (!parsed.success) return Promise.resolve({ ok: false, reason: "invalid interrupt" });
			return interruptAgent(deps, ...parsed.data);
		},
	);
}
