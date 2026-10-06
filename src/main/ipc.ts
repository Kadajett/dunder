import type { Roster } from "@shared/company/roster";
import { type BridgeStatus, IPC } from "@shared/ipc";
import type { MailQueue } from "@shared/mail-queue";
import type { WeatherFeed } from "@shared/tv";
import {
	type IpcMainEvent,
	type IpcMainInvokeEvent,
	ipcMain,
	MessageChannelMain,
	type WebContents,
} from "electron";
import { z } from "zod";
import type { Calisthenics } from "./calisthenics/service";
import type { OfficeBridge } from "./herdr/office-bridge";
import type { SwitchboardService } from "./switchboard/service";
import { createCoalescingSink, type WindowSink } from "./terminal/screen-sink";
import type { ScreensService } from "./terminal/screens-service";

const cell = z.number().int().min(0).max(10_000);
const size = z.number().int().min(2).max(1_000);
const paneId = z.string().min(1).max(64);
const terminalId = z.string().min(1).max(64);

const openRequestSchema = z.object({ paneId, cols: size, rows: size, takeover: z.boolean() });

const observeSchema = z.object({ subscriberId: z.string().min(1).max(128), paneId });

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

const commandMessageSchema = z.object({ terminalId, command: commandSchema });

/** Screen traffic for one window, coalesced onto the main end of its MessageChannel. */
function windowSink(contents: WebContents): WindowSink {
	const { port1, port2 } = new MessageChannelMain();
	const sink = createCoalescingSink(contents.id, (message) => port1.postMessage(message));
	contents.postMessage(IPC.screensPort, null, [port2]);
	return {
		...sink,
		dispose() {
			sink.dispose();
			port1.close();
		},
	};
}

export interface IpcDeps {
	readonly bridge: () => OfficeBridge | undefined;
	readonly status: () => BridgeStatus;
	readonly screens: ScreensService;
	readonly weather: () => WeatherFeed;
	readonly calisthenics: Calisthenics;
	readonly switchboard: Pick<SwitchboardService, "recent">;
	readonly roster: () => Roster | undefined;
	readonly mailQueue: () => MailQueue;
}

/** Register every renderer-facing handler. Renderer payloads are untrusted. */
export function registerIpc(deps: IpcDeps): void {
	const { screens } = deps;
	const tracked = new WeakSet<WebContents>();
	ipcMain.handle(IPC.getSnapshot, () => deps.bridge()?.latest() ?? null);
	ipcMain.handle(IPC.getStatus, () => deps.status());
	ipcMain.handle(IPC.getWeather, () => deps.weather());
	ipcMain.handle(IPC.switchboardRecent, () => deps.switchboard.recent());
	ipcMain.handle(IPC.mailQueued, () => deps.mailQueue());
	ipcMain.handle(IPC.getRoster, () => deps.roster() ?? null);
	ipcMain.handle(IPC.calisthenicsActive, () => deps.calisthenics.active());
	ipcMain.handle(IPC.calisthenicsStart, () => {
		deps.calisthenics.startNow();
	});
	ipcMain.on(IPC.screensConnect, (event: IpcMainEvent) => {
		const contents = event.sender;
		const ownerId = contents.id;
		if (!tracked.has(contents)) {
			tracked.add(contents);
			contents.once("destroyed", () => screens.disconnect(ownerId));
			contents.on("render-process-gone", () => screens.disconnect(ownerId));
		}
		screens.connect(windowSink(contents));
	});
	ipcMain.on(IPC.screensObserve, (event: IpcMainEvent, payload: unknown) => {
		const parsed = observeSchema.safeParse(payload);
		if (parsed.success) {
			screens.observe(event.sender.id, parsed.data.subscriberId, parsed.data.paneId);
		}
	});
	ipcMain.on(IPC.screensUnobserve, (event: IpcMainEvent, payload: unknown) => {
		const parsed = observeSchema.safeParse(payload);
		if (parsed.success) {
			screens.unobserve(event.sender.id, parsed.data.subscriberId, parsed.data.paneId);
		}
	});
	ipcMain.handle(IPC.terminalOpen, (event: IpcMainInvokeEvent, payload: unknown) =>
		screens.open(event.sender.id, openRequestSchema.parse(payload)),
	);
	ipcMain.on(IPC.terminalCommand, (event: IpcMainEvent, payload: unknown) => {
		const parsed = commandMessageSchema.safeParse(payload);
		if (parsed.success) screens.send(event.sender.id, parsed.data.terminalId, parsed.data.command);
	});
	ipcMain.on(IPC.terminalClose, (event: IpcMainEvent, payload: unknown) => {
		const parsed = terminalId.safeParse(payload);
		if (parsed.success) screens.close(event.sender.id, parsed.data);
	});
}
