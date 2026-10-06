import {
	type BridgeStatus,
	IPC,
	type TerminalClosedMessage,
	type TerminalFrameMessage,
} from "@shared/ipc";
import { type IpcMainEvent, type IpcMainInvokeEvent, ipcMain, type WebContents } from "electron";
import { z } from "zod";
import type { OfficeBridge } from "./herdr/office-bridge";
import type { TerminalRegistry, TerminalSink } from "./terminal/registry";

const cell = z.number().int().min(0).max(10_000);
const size = z.number().int().min(2).max(1_000);

const openRequestSchema = z.object({
	paneId: z.string().min(1).max(64),
	cols: size,
	rows: size,
	takeover: z.boolean(),
});

const commandSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("terminal.input"), text: z.string().max(1_000_000) }),
	z.object({ type: z.literal("terminal.resize"), cols: size, rows: size }),
	z.object({
		type: z.literal("terminal.scroll"),
		direction: z.enum(["up", "down"]),
		lines: z.number().int().min(1).max(1_000),
		source: z.enum(["wheel", "page_key"]),
		column: cell.optional(),
		row: cell.optional(),
	}),
	z.object({
		type: z.literal("terminal.mouse"),
		action: z.enum(["down", "up", "drag", "move"]),
		button: z.enum(["left", "right", "middle"]),
		column: cell,
		row: cell,
	}),
	z.object({ type: z.literal("terminal.release") }),
]);

const commandMessageSchema = z.object({ terminalId: z.string(), command: commandSchema });

function sinkFor(contents: WebContents): TerminalSink {
	return {
		ownerId: contents.id,
		frame: (terminalId, frame) => {
			if (contents.isDestroyed()) return;
			contents.send(IPC.terminalFrame, {
				terminalId,
				data: frame.data,
			} satisfies TerminalFrameMessage);
		},
		closed: (terminalId, reason) => {
			if (contents.isDestroyed()) return;
			contents.send(IPC.terminalClosed, { terminalId, reason } satisfies TerminalClosedMessage);
		},
	};
}

export interface IpcDeps {
	readonly bridge: () => OfficeBridge | undefined;
	readonly status: () => BridgeStatus;
	readonly terminals: TerminalRegistry;
}

/** Register every renderer-facing handler. Renderer payloads are untrusted. */
export function registerIpc(deps: IpcDeps): void {
	const tracked = new WeakSet<WebContents>();
	ipcMain.handle(IPC.getSnapshot, () => deps.bridge()?.latest() ?? null);
	ipcMain.handle(IPC.getStatus, () => deps.status());
	ipcMain.handle(IPC.terminalOpen, (event: IpcMainInvokeEvent, payload: unknown) => {
		const request = openRequestSchema.parse(payload);
		const contents = event.sender;
		if (!tracked.has(contents)) {
			tracked.add(contents);
			contents.once("destroyed", () => deps.terminals.closeOwnedBy(contents.id));
		}
		return deps.terminals.open(request, sinkFor(contents));
	});
	ipcMain.on(IPC.terminalCommand, (_event: IpcMainEvent, payload: unknown) => {
		const parsed = commandMessageSchema.safeParse(payload);
		if (parsed.success) deps.terminals.send(parsed.data.terminalId, parsed.data.command);
	});
	ipcMain.on(IPC.terminalClose, (_event: IpcMainEvent, payload: unknown) => {
		if (typeof payload === "string") deps.terminals.close(payload);
	});
}
