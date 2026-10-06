import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import type { TerminalCommand, TerminalOpenRequest } from "@shared/terminal";
import { z } from "zod";
import { herdrBinary, herdrChildEnv, officeArgs } from "../herdr/cli";
import { createLineSplitter } from "../herdr/ndjson";

const outputSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("terminal.frame"),
		bytes: z.string(),
		full: z.boolean(),
		width: z.number(),
		height: z.number(),
		seq: z.number(),
	}),
	z.object({ type: z.literal("terminal.closed"), reason: z.string() }),
]);

export interface TerminalFrame {
	/** ANSI bytes that repaint (part of) the herdr-rendered screen. */
	readonly data: Uint8Array;
	readonly full: boolean;
	readonly cols: number;
	readonly rows: number;
	readonly seq: number;
}

export type ControlOutput =
	| { readonly kind: "frame"; readonly frame: TerminalFrame }
	| { readonly kind: "closed"; readonly reason: string };

/** Decode one stdout line of `terminal session control`; unknown lines yield `undefined`. */
export function parseControlLine(line: string): ControlOutput | undefined {
	let json: unknown;
	try {
		json = JSON.parse(line);
	} catch {
		return undefined;
	}
	const parsed = outputSchema.safeParse(json);
	if (!parsed.success) return undefined;
	const message = parsed.data;
	if (message.type === "terminal.closed") return { kind: "closed", reason: message.reason };
	const data = Buffer.from(message.bytes, "base64");
	return {
		kind: "frame",
		frame: {
			data,
			full: message.full,
			cols: message.width,
			rows: message.height,
			seq: message.seq,
		},
	};
}

export function controlArgs(request: TerminalOpenRequest): string[] {
	const size = ["--cols", String(request.cols), "--rows", String(request.rows)];
	const takeover = request.takeover ? ["--takeover"] : [];
	return officeArgs(["terminal", "session", "control", request.paneId, ...size, ...takeover]);
}

export interface ControlSessionEvents {
	onFrame(frame: TerminalFrame): void;
	/** Fired exactly once, when the control process has ended. */
	onClosed(reason: string): void;
}

export interface ControlSession {
	send(command: TerminalCommand): void;
	/** Release the pane politely, then stop the process. */
	close(): void;
}

export type SpawnControl = (args: readonly string[]) => ChildProcessWithoutNullStreams;

const spawnHerdr: SpawnControl = (args) =>
	spawn(herdrBinary(process.env), [...args], { env: herdrChildEnv(process.env) });

export function startControlSession(
	request: TerminalOpenRequest,
	events: ControlSessionEvents,
	spawnControl: SpawnControl = spawnHerdr,
): ControlSession {
	const child = spawnControl(controlArgs(request));
	let closedReason: string | undefined;
	let stderrTail = "";
	let ended = false;
	let killTimer: NodeJS.Timeout | undefined;

	const finish = (reason: string): void => {
		if (ended) return;
		ended = true;
		clearTimeout(killTimer);
		events.onClosed(reason);
	};

	child.stdout.setEncoding("utf8");
	child.stdout.on(
		"data",
		createLineSplitter((line) => {
			const output = parseControlLine(line);
			if (output?.kind === "frame") events.onFrame(output.frame);
			if (output?.kind === "closed") closedReason = output.reason;
		}),
	);
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		stderrTail = (stderrTail + chunk).slice(-4_000);
	});
	child.on("error", (error) => finish(`could not run herdr: ${error.message}`));
	child.on("close", (code) => {
		finish(closedReason ?? (stderrTail.trim() || `herdr exited with code ${code ?? "unknown"}`));
	});

	const send = (command: TerminalCommand): void => {
		if (ended || !child.stdin.writable) return;
		child.stdin.write(`${JSON.stringify(command)}\n`);
	};

	return {
		send,
		close() {
			if (ended || killTimer) return;
			send({ type: "terminal.release" });
			child.stdin.end();
			killTimer = setTimeout(() => child.kill("SIGTERM"), 1_000);
		},
	};
}
