import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HerdrEvent } from "@shared/herdr/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHerdrApi, HerdrApiError, type SubscriptionHandle } from "./api-client";
import { createLineSplitter } from "./ndjson";

interface ReceivedRequest {
	readonly id: string;
	readonly method: string;
	readonly params: Record<string, unknown>;
}

type Handler = (socket: Socket, request: ReceivedRequest) => void;

let dir: string;
let server: Server | undefined;
const sockets = new Set<Socket>();
const closedSockets: Socket[] = [];

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "herdr-office-api-"));
});

afterEach(async () => {
	for (const socket of sockets) socket.destroy();
	sockets.clear();
	closedSockets.length = 0;
	vi.useRealTimers();
	const current = server;
	server = undefined;
	if (current) {
		const { promise, resolve } = Promise.withResolvers<void>();
		current.close(() => resolve());
		await promise;
	}
	await rm(dir, { recursive: true, force: true });
});

/** A fake herdr server: one handler call per request line. */
async function listen(handler: Handler): Promise<string> {
	const socketPath = join(dir, "herdr.sock");
	server = createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => closedSockets.push(socket));
		socket.setEncoding("utf8");
		socket.on(
			"data",
			createLineSplitter((line) => handler(socket, JSON.parse(line))),
		);
	});
	const listening = Promise.withResolvers<void>();
	server.listen(socketPath, listening.resolve);
	await listening.promise;
	return socketPath;
}

const send = (socket: Socket, message: unknown): void => {
	socket.write(`${JSON.stringify(message)}\n`);
};

describe("createHerdrApi().call", () => {
	it("sends the method and params and resolves with the result", async () => {
		const received: ReceivedRequest[] = [];
		const socketPath = await listen((socket, request) => {
			received.push(request);
			send(socket, { id: request.id, result: { type: "pong", echo: request.params } });
			socket.end();
		});

		const result = await createHerdrApi(socketPath).call("ping", { value: 7 });

		expect(result).toEqual({ type: "pong", echo: { value: 7 } });
		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({ method: "ping", params: { value: 7 } });
	});

	it("uses a distinct request id for each call", async () => {
		const ids: string[] = [];
		const socketPath = await listen((socket, request) => {
			ids.push(request.id);
			send(socket, { id: request.id, result: {} });
			socket.end();
		});
		const api = createHerdrApi(socketPath);

		await api.call("a");
		await api.call("b");

		expect(new Set(ids).size).toBe(2);
	});

	it("rejects with HerdrApiError carrying the server error code", async () => {
		const socketPath = await listen((socket, request) => {
			send(socket, { id: request.id, error: { code: "pane_not_found", message: "no such pane" } });
			socket.end();
		});

		const error = await createHerdrApi(socketPath)
			.call("pane.get", { pane_id: "x" })
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(HerdrApiError);
		expect(error).toMatchObject({ code: "pane_not_found", message: "no such pane" });
	});

	it("rejects when the server does not answer within the timeout", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const received: ReceivedRequest[] = [];
		const socketPath = await listen((_socket, request) => received.push(request));

		const outcome = createHerdrApi(socketPath)
			.call("slow", {}, 5_000)
			.catch((error: unknown) => error);
		await vi.waitFor(() => expect(received).toHaveLength(1));
		vi.advanceTimersByTime(5_000);

		expect(await outcome).toMatchObject({ message: "herdr slow timed out after 5000ms" });
	});

	it("rejects when the server closes the connection without replying", async () => {
		const socketPath = await listen((socket) => socket.end());

		await expect(createHerdrApi(socketPath).call("rude")).rejects.toThrow(
			"herdr rude connection closed before a response",
		);
	});

	it("rejects when nothing is listening on the socket", async () => {
		await expect(createHerdrApi(join(dir, "missing.sock")).call("ping")).rejects.toThrow(
			/herdr ping failed/,
		);
	});
});

interface Recorder {
	readonly handle: SubscriptionHandle;
	readonly started: { count: number };
	readonly events: HerdrEvent[];
	readonly closes: (Error | undefined)[];
}

function record(socketPath: string): Recorder {
	const started = { count: 0 };
	const events: HerdrEvent[] = [];
	const closes: (Error | undefined)[] = [];
	const handle = createHerdrApi(socketPath).subscribe([{ type: "pane.created" }], {
		onStart: () => {
			started.count += 1;
		},
		onEvent: (event) => events.push(event),
		onClose: (error) => closes.push(error),
	});
	return { handle, started, events, closes };
}

const startLine = (id: string) => ({ id, result: { type: "subscription_started" } });
const paneCreated = { event: "pane_created", data: { pane_id: "p1" } };

describe("createHerdrApi().subscribe", () => {
	it("sends events.subscribe with the subscriptions and fires onStart once started", async () => {
		const received: ReceivedRequest[] = [];
		const socketPath = await listen((socket, request) => {
			received.push(request);
			send(socket, startLine(request.id));
		});

		const recorder = record(socketPath);

		await vi.waitFor(() => expect(recorder.started.count).toBe(1));
		expect(received[0]).toMatchObject({
			method: "events.subscribe",
			params: { subscriptions: [{ type: "pane.created" }] },
		});
		expect(recorder.closes).toEqual([]);
		recorder.handle.close();
	});

	it("does not fire onStart before the server acknowledges", async () => {
		let serverSocket: Socket | undefined;
		const socketPath = await listen((socket) => {
			serverSocket = socket;
		});

		const recorder = record(socketPath);

		await vi.waitFor(() => expect(serverSocket).toBeDefined());
		expect(recorder.started.count).toBe(0);
		recorder.handle.close();
	});

	it("delivers each streamed event in order", async () => {
		const second = { event: "pane_closed", data: { pane_id: "p1" } };
		const socketPath = await listen((socket, request) => {
			send(socket, startLine(request.id));
			send(socket, paneCreated);
			send(socket, second);
		});

		const recorder = record(socketPath);

		await vi.waitFor(() => expect(recorder.events).toHaveLength(2));
		expect(recorder.events).toEqual([paneCreated, second]);
		expect(recorder.closes).toEqual([]);
		recorder.handle.close();
	});

	it("ignores lines that are not events and keeps streaming", async () => {
		const socketPath = await listen((socket, request) => {
			send(socket, startLine(request.id));
			send(socket, { type: "heartbeat" });
			send(socket, { event: "pane_created", data: "not an object" });
			send(socket, paneCreated);
		});

		const recorder = record(socketPath);

		await vi.waitFor(() => expect(recorder.events.length + recorder.closes.length).toBe(1));
		expect(recorder.closes).toEqual([]);
		expect(recorder.events).toEqual([paneCreated]);
		recorder.handle.close();
	});

	it("reports a subscription error response through onClose", async () => {
		const socketPath = await listen((socket, request) => {
			send(socket, { id: request.id, error: { code: "invalid_params", message: "bad type" } });
		});

		const recorder = record(socketPath);

		await vi.waitFor(() => expect(recorder.closes).toHaveLength(1));
		expect(recorder.started.count).toBe(0);
		expect(recorder.closes[0]).toBeInstanceOf(HerdrApiError);
		expect(recorder.closes[0]).toMatchObject({ code: "invalid_params" });
	});

	it("fires onClose once, without an error, when the server ends the stream", async () => {
		const socketPath = await listen((socket, request) => {
			send(socket, startLine(request.id));
			send(socket, paneCreated);
			socket.end();
		});

		const recorder = record(socketPath);

		await vi.waitFor(() => expect(recorder.closes).toHaveLength(1));
		expect(recorder.closes).toEqual([undefined]);
		expect(recorder.events).toEqual([paneCreated]);
	});

	it("does not fire onClose after the caller closes the handle", async () => {
		let serverSocket: Socket | undefined;
		const socketPath = await listen((socket, request) => {
			serverSocket = socket;
			send(socket, startLine(request.id));
		});
		const recorder = record(socketPath);
		await vi.waitFor(() => expect(recorder.started.count).toBe(1));

		recorder.handle.close();

		// The client's own "close" event fires on nextTick after destroy, so it has
		// run by the time the server observes the disconnect.
		await vi.waitFor(() => expect(closedSockets).toContain(serverSocket));
		expect(recorder.closes).toEqual([]);
	});
});
