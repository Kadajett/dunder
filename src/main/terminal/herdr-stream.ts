import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import type { TerminalCommand } from "@shared/terminal";
import { z } from "zod";
import { herdrBinary, herdrChildEnv } from "../herdr/cli";
import { createLineSplitter } from "../herdr/ndjson";

/**
 * One `herdr terminal session observe|control` child process: NDJSON frames on
 * stdout, JSON commands on stdin (control only).
 */
const outputSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("terminal.frame"),
		bytes: z.string(),
		full: z.boolean(),
		width: z.number().int().positive(),
		height: z.number().int().positive(),
		seq: z.number(),
	}),
	z.object({ type: z.literal("terminal.closed"), reason: z.string() }),
]);

/** Size of a terminal grid in cells. */
export interface PaneSize {
	readonly cols: number;
	readonly rows: number;
}

export interface TerminalFrame extends PaneSize {
	/** ANSI bytes that repaint (part of) the herdr-rendered screen. */
	readonly data: Uint8Array;
	/** herdr marks the attach repaint (and any later full repaint) as full. */
	readonly full: boolean;
	readonly seq: number;
}

export type StreamOutput =
	| { readonly kind: "frame"; readonly frame: TerminalFrame }
	| { readonly kind: "closed"; readonly reason: string };

/** Decode one stdout line of observe/control; unknown lines yield `undefined`. */
export function parseStreamLine(line: string): StreamOutput | undefined {
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
	return {
		kind: "frame",
		frame: {
			data: Buffer.from(message.bytes, "base64"),
			full: message.full,
			cols: message.width,
			rows: message.height,
			seq: message.seq,
		},
	};
}

export interface StreamEvents {
	onFrame(frame: TerminalFrame): void;
	/** Fired exactly once, when the process has ended. */
	onClosed(reason: string): void;
}

export type SpawnHerdr = (args: readonly string[]) => ChildProcessWithoutNullStreams;

export const spawnHerdr: SpawnHerdr = (args) =>
	spawn(herdrBinary(process.env), [...args], { env: herdrChildEnv(process.env) });

export interface HerdrStream {
	send(command: TerminalCommand): void;
	/** End stdin (after any final command) and SIGTERM the process after `graceMs`. */
	stop(graceMs: number): void;
	/** Settles once the process has exited. */
	readonly exited: Promise<void>;
}

export function startHerdrStream(
	args: readonly string[],
	events: StreamEvents,
	spawnStream: SpawnHerdr = spawnHerdr,
): HerdrStream {
	const child = spawnStream(args);
	const exited = Promise.withResolvers<void>();
	let closedReason: string | undefined;
	let stderrTail = "";
	let ended = false;
	let killTimer: NodeJS.Timeout | undefined;

	const finish = (reason: string): void => {
		if (ended) return;
		ended = true;
		clearTimeout(killTimer);
		exited.resolve();
		events.onClosed(reason);
	};

	child.stdout.setEncoding("utf8");
	child.stdout.on(
		"data",
		createLineSplitter((line) => {
			const output = parseStreamLine(line);
			if (output?.kind === "frame" && !ended) events.onFrame(output.frame);
			if (output?.kind === "closed") closedReason = output.reason;
		}),
	);
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		stderrTail = (stderrTail + chunk).slice(-4_000);
	});
	// A process that exits early makes stdin writes fail with EPIPE; `close` reports it.
	child.stdin.on("error", () => undefined);
	child.on("error", (error) => finish(`could not run herdr: ${error.message}`));
	child.on("close", (code) => {
		finish(closedReason ?? (stderrTail.trim() || `herdr exited with code ${code ?? "unknown"}`));
	});

	return {
		send(command) {
			if (ended || !child.stdin.writable) return;
			child.stdin.write(`${JSON.stringify(command)}\n`);
		},
		stop(graceMs) {
			if (ended || killTimer) return;
			child.stdin.end();
			killTimer = setTimeout(() => child.kill("SIGTERM"), graceMs);
		},
		exited: exited.promise,
	};
}
