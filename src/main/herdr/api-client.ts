import { createConnection } from "node:net";
import { type HerdrEvent, herdrEventSchema } from "@shared/herdr/schema";
import { z } from "zod";
import { createLineSplitter } from "./ndjson";

/** A herdr server error response (`{"error":{"code","message"}}`). */
export class HerdrApiError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "HerdrApiError";
		this.code = code;
	}
}

const envelopeSchema = z.object({
	id: z.string(),
	result: z.unknown().optional(),
	error: z.object({ code: z.string(), message: z.string() }).optional(),
});

function parseResponse(line: string): unknown {
	const envelope = envelopeSchema.parse(JSON.parse(line));
	if (envelope.error) throw new HerdrApiError(envelope.error.code, envelope.error.message);
	return envelope.result;
}

export type HerdrSubscription = { readonly type: string } & Readonly<Record<string, unknown>>;

export interface SubscriptionHandlers {
	onStart?(): void;
	onEvent(event: HerdrEvent): void;
	/** Fired once when the server or socket ends the stream; not after `close()`. */
	onClose(error?: Error): void;
}

export interface SubscriptionHandle {
	close(): void;
}

type Params = Readonly<Record<string, unknown>>;

export interface HerdrApi {
	call(method: string, params?: Params, timeoutMs?: number): Promise<unknown>;
	subscribe(
		subscriptions: readonly HerdrSubscription[],
		handlers: SubscriptionHandlers,
	): SubscriptionHandle;
}

interface Request {
	readonly id: string;
	readonly method: string;
	readonly params: Params;
}

/** One request, one connection: the server answers a single line and closes. */
function callOnce(socketPath: string, request: Request, timeoutMs: number): Promise<unknown> {
	const { promise, resolve, reject } = Promise.withResolvers<unknown>();
	const socket = createConnection(socketPath);
	let settled = false;
	const settle = (outcome: () => void): void => {
		if (settled) return;
		settled = true;
		clearTimeout(timer);
		socket.destroy();
		outcome();
	};
	const fail = (message: string, cause?: Error): void =>
		settle(() => reject(new Error(`herdr ${request.method} ${message}`, { cause })));
	const timer = setTimeout(() => fail(`timed out after ${timeoutMs}ms`), timeoutMs);

	socket.setEncoding("utf8");
	socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
	socket.on(
		"data",
		createLineSplitter((line) =>
			settle(() => {
				try {
					resolve(parseResponse(line));
				} catch (error) {
					reject(error);
				}
			}),
		),
	);
	socket.on("error", (error) => fail(`failed: ${error.message}`, error));
	socket.on("close", () => fail("connection closed before a response"));
	return promise;
}

/** `events.subscribe` keeps its connection open and streams one event per line. */
function subscribeOnce(
	socketPath: string,
	request: Request,
	handlers: SubscriptionHandlers,
): SubscriptionHandle {
	const socket = createConnection(socketPath);
	let started = false;
	let finished = false;
	const finish = (error?: Error): void => {
		if (finished) return;
		finished = true;
		socket.destroy();
		handlers.onClose(error);
	};
	const handleLine = (line: string): void => {
		if (!started) {
			parseResponse(line);
			started = true;
			handlers.onStart?.();
			return;
		}
		const parsed = herdrEventSchema.safeParse(JSON.parse(line));
		if (parsed.success) handlers.onEvent(parsed.data);
	};

	socket.setEncoding("utf8");
	socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
	socket.on(
		"data",
		createLineSplitter((line) => {
			try {
				handleLine(line);
			} catch (error) {
				finish(error instanceof Error ? error : new Error(String(error)));
			}
		}),
	);
	socket.on("error", (error) => finish(error));
	socket.on("close", () => finish());
	return {
		close() {
			finished = true;
			socket.destroy();
		},
	};
}

/** Client for herdr's newline-delimited JSON socket API. */
export function createHerdrApi(socketPath: string): HerdrApi {
	let sequence = 0;
	const request = (method: string, params: Params): Request => {
		sequence += 1;
		return { id: `herdr-office:${sequence}`, method, params };
	};
	return {
		call: (method, params = {}, timeoutMs = 10_000) =>
			callOnce(socketPath, request(method, params), timeoutMs),
		subscribe: (subscriptions, handlers) =>
			subscribeOnce(socketPath, request("events.subscribe", { subscriptions }), handlers),
	};
}
