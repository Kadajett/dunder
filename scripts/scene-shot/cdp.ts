import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const LAUNCH_TIMEOUT_MS = 20_000;
const SYSTEM_CHROMES = [
	"/usr/bin/google-chrome-stable",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
];
/** Software GL keeps shots identical across machines and needs no display. */
const CHROME_FLAGS = [
	"--headless=new",
	"--remote-debugging-port=0",
	"--no-first-run",
	"--no-default-browser-check",
	"--hide-scrollbars",
	"--mute-audio",
	"--use-angle=swiftshader",
	"--enable-unsafe-swiftshader",
];

/** `$SCENE_SHOT_CHROME`, a system Chrome/Chromium, or Playwright's cached headless shell. */
export function findChrome(env: Readonly<Record<string, string | undefined>>): string {
	const explicit = env["SCENE_SHOT_CHROME"];
	if (explicit) return explicit;
	const system = SYSTEM_CHROMES.find((path) => existsSync(path));
	if (system) return system;
	const cache = join(homedir(), ".cache", "ms-playwright");
	const shells = existsSync(cache)
		? readdirSync(cache).filter((dir) => dir.startsWith("chromium_headless_shell-"))
		: [];
	const newest = shells.sort().at(-1);
	const shell =
		newest && join(cache, newest, "chrome-headless-shell-linux64", "chrome-headless-shell");
	if (shell && existsSync(shell)) return shell;
	throw new Error("no Chrome/Chromium found; set SCENE_SHOT_CHROME to a Chromium binary");
}

export interface Chrome {
	/** Browser-level DevTools WebSocket URL. */
	readonly endpoint: string;
	stop(): Promise<void>;
}

/** Waits for Chrome's `DevTools listening on ws://…` line. */
function devtoolsEndpoint(child: ChildProcess): Promise<string> {
	const { promise, resolve, reject } = Promise.withResolvers<string>();
	let output = "";
	const timer = setTimeout(
		() => reject(new Error("Chrome did not start in time")),
		LAUNCH_TIMEOUT_MS,
	);
	child.stderr?.on("data", (chunk: Buffer) => {
		output += chunk.toString();
		const match = /DevTools listening on (ws:\/\/\S+)/.exec(output);
		if (!match?.[1]) return;
		clearTimeout(timer);
		resolve(match[1]);
	});
	child.once("exit", (code) => {
		clearTimeout(timer);
		reject(new Error(`Chrome exited (${code}) before DevTools was ready:\n${output}`));
	});
	return promise;
}

export async function launchChrome(path: string): Promise<Chrome> {
	const profile = await mkdtemp(join(tmpdir(), "scene-shot-"));
	const child = spawn(path, [...CHROME_FLAGS, `--user-data-dir=${profile}`, "about:blank"], {
		stdio: ["ignore", "ignore", "pipe"],
	});
	const stop = async (): Promise<void> => {
		if (child.exitCode === null) {
			const exited = Promise.withResolvers<void>();
			child.once("exit", () => exited.resolve());
			child.kill();
			await exited.promise;
		}
		await rm(profile, { recursive: true, force: true });
	};
	try {
		return { endpoint: await devtoolsEndpoint(child), stop };
	} catch (error) {
		await stop();
		throw error;
	}
}

const replySchema = z.object({
	id: z.number().optional(),
	method: z.string().optional(),
	params: z.unknown().optional(),
	result: z.unknown().optional(),
	error: z.object({ message: z.string() }).optional(),
});

interface Pending {
	resolve(result: unknown): void;
	reject(error: Error): void;
}

/** Just enough of the Chrome DevTools Protocol: flat sessions, commands and events. */
export class Cdp {
	readonly #socket: WebSocket;
	readonly #pending = new Map<number, Pending>();
	readonly #onEvent: (method: string, params: unknown) => void;
	#nextId = 1;

	private constructor(socket: WebSocket, onEvent: (method: string, params: unknown) => void) {
		this.#socket = socket;
		this.#onEvent = onEvent;
		socket.addEventListener("message", (event) => this.#receive(String(event.data)));
	}

	static async connect(
		endpoint: string,
		onEvent: (method: string, params: unknown) => void,
	): Promise<Cdp> {
		const socket = new WebSocket(endpoint);
		const opened = Promise.withResolvers<void>();
		socket.addEventListener("open", () => opened.resolve(), { once: true });
		socket.addEventListener("error", () => opened.reject(new Error("CDP connect failed")), {
			once: true,
		});
		await opened.promise;
		return new Cdp(socket, onEvent);
	}

	/** Sends a command (to a page when `sessionId` is set) and parses its result. */
	async send<T>(
		schema: z.ZodType<T>,
		method: string,
		params: Record<string, unknown> = {},
		sessionId?: string,
	): Promise<T> {
		const id = this.#nextId++;
		const reply = Promise.withResolvers<unknown>();
		this.#pending.set(id, reply);
		this.#socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
		return schema.parse(await reply.promise);
	}

	close(): void {
		this.#socket.close();
	}

	#receive(text: string): void {
		const message = replySchema.parse(JSON.parse(text));
		if (message.id === undefined) {
			if (message.method) this.#onEvent(message.method, message.params);
			return;
		}
		const pending = this.#pending.get(message.id);
		this.#pending.delete(message.id);
		if (message.error) pending?.reject(new Error(message.error.message));
		else pending?.resolve(message.result);
	}
}
