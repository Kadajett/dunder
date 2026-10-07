import { IPC } from "@shared/ipc";
import { ipcMain } from "electron";
import { z } from "zod";
import type { AgentRepliesService } from "./service";

const nameSchema = z.string().min(1).max(200);

/** `window.office.agents` handlers. */
export function registerAgentRepliesIpc(replies: AgentRepliesService): void {
	ipcMain.handle(IPC.agentsLastReply, (_event, name: unknown) =>
		replies.lastReply(nameSchema.parse(name)),
	);
}
