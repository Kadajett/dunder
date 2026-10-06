import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createHerdrApi } from "../herdr/api-client";
import { officeArgs, runHerdr } from "../herdr/cli";
import { defaultSessionDeps, ensureOfficeServer } from "../herdr/session";
import { startControlSession } from "./control-session";
import { type StreamEvents, spawnHerdr, type TerminalFrame } from "./herdr-stream";
import { ObservePool } from "./observe-pool";
import { startObserveSession } from "./observe-session";
import { createPaneSizeResolver, type ResolvePaneSize } from "./pane-size";
import { createPtySizeResolver } from "./pty-size";
import { TerminalRegistry } from "./registry";
import type { ScreenSink } from "./screen-sink";

/**
 * Contract tests against the real `office` herdr session. They only touch a
 * scratch workspace they create (`contract-tests`) and close it afterwards.
 */
const createdSchema = z.object({
	result: z.object({
		root_pane: z.object({ pane_id: z.string() }),
		workspace: z.object({ workspace_id: z.string() }),
	}),
});

/** Real delay: herdr and the pane's shell are external processes we can only poll. */
function sleep(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

async function waitFor<T>(
	probe: () => Promise<T | undefined> | T | undefined,
	what: string,
): Promise<T> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		const value = await probe();
		if (value !== undefined) return value;
		await sleep(100);
	}
	throw new Error(`timed out waiting for ${what}`);
}

async function paneText(paneId: string): Promise<string> {
	const args = ["pane", "read", paneId, "--source", "recent", "--lines", "80"];
	return (await runHerdr(officeArgs(args))).stdout;
}

let marker = 0;
/** The pane PTY's real size, as `stty` inside the pane reports it. */
async function ptySize(paneId: string): Promise<{ cols: number; rows: number }> {
	marker += 1;
	const tag = `pty-size-${marker}`;
	await runHerdr(officeArgs(["pane", "send-text", paneId, `echo ${tag}: $(stty size)\n`]));
	const match = await waitFor(
		async () =>
			new RegExp(`^${tag}: (\\d+) (\\d+)\\s*$`, "m").exec(await paneText(paneId)) ?? undefined,
		tag,
	);
	return { rows: Number(match[1]), cols: Number(match[2]) };
}

function recorder() {
	const frames: TerminalFrame[] = [];
	const firstFrame = Promise.withResolvers<TerminalFrame>();
	const closed = Promise.withResolvers<string>();
	const events: StreamEvents = {
		onFrame: (frame) => {
			frames.push(frame);
			firstFrame.resolve(frame);
		},
		onClosed: closed.resolve,
	};
	return { events, frames, firstFrame: firstFrame.promise, closed: closed.promise };
}

const nullSink: ScreenSink = { ownerId: 1, write: () => undefined, status: () => undefined };

describe("herdr office terminal streams", () => {
	let paneId = "";
	let workspaceId = "";
	let paneSize: ResolvePaneSize;
	let ptySizeOf: ResolvePaneSize;

	beforeAll(async () => {
		const socketPath = await ensureOfficeServer(
			defaultSessionDeps(join(tmpdir(), "herdr-office-contract-server.log")),
		);
		paneSize = createPaneSizeResolver(Promise.resolve(createHerdrApi(socketPath)));
		ptySizeOf = createPtySizeResolver(paneSize);
		const create = [
			"workspace",
			"create",
			"--label",
			"contract-tests",
			"--no-focus",
			"--cwd",
			tmpdir(),
		];
		const created = createdSchema.parse(JSON.parse((await runHerdr(officeArgs(create))).stdout));
		paneId = created.result.root_pane.pane_id;
		workspaceId = created.result.workspace.workspace_id;
		await waitFor(
			async () => ((await paneText(paneId)).trim() ? true : undefined),
			"a shell prompt",
		);
	});

	afterAll(async () => {
		if (workspaceId) await runHerdr(officeArgs(["workspace", "close", workspaceId]));
	});

	it("observe starts with a full repaint at the requested size", async () => {
		const { events, firstFrame } = recorder();
		const session = startObserveSession(paneId, { cols: 80, rows: 24 }, events);
		const frame = await firstFrame;
		session.stop();
		await session.exited;
		expect(frame).toMatchObject({ full: true, cols: 80, rows: 24 });
		expect(Buffer.from(frame.data).toString("latin1")).toContain("\x1b[2J");
	});

	it("terminal.input text shows up in pane read", async () => {
		const { events, firstFrame, closed } = recorder();
		const control = startControlSession({ paneId, cols: 100, rows: 30, takeover: true }, events);
		await firstFrame;
		control.send({ type: "terminal.input", text: "echo contract-$((40 + 2))\r" });
		await waitFor(
			async () => ((await paneText(paneId)).includes("contract-42") ? true : undefined),
			"echo",
		);
		control.close();
		expect(await closed).toBe("detached");
	});

	it("terminal.resize changes the pane size; release restores the home size", async () => {
		const registry = new TerminalRegistry({ homeSize: paneSize });
		const statuses: string[] = [];
		const sink: ScreenSink = { ...nullSink, status: (status) => statuses.push(status.state) };
		const id = registry.open({ paneId, cols: 100, rows: 30, takeover: true }, sink);
		await waitFor(() => (statuses.includes("live") ? true : undefined), "live");
		registry.send(id, { type: "terminal.resize", cols: 90, rows: 20 });
		expect(await ptySize(paneId)).toEqual({ cols: 90, rows: 20 });
		registry.close(id);
		await waitFor(() => (statuses.includes("closed") ? true : undefined), "closed");
		expect(await ptySize(paneId)).toEqual(await paneSize(paneId));
	});

	it("the observe size resolver reads the pane's real PTY size", async () => {
		const control = recorder();
		const session = startControlSession(
			{ paneId, cols: 97, rows: 23, takeover: true },
			control.events,
		);
		await control.firstFrame;
		expect(await ptySizeOf(paneId)).toEqual({ cols: 97, rows: 23 });
		expect(await ptySizeOf(paneId)).toEqual(await ptySize(paneId));
		session.close(await paneSize(paneId));
		expect(await control.closed).toBe("detached");
		expect(await ptySizeOf(paneId)).toEqual(await paneSize(paneId));
	});

	it("release closes the control stream with reason detached", async () => {
		const { events, firstFrame, closed } = recorder();
		const control = startControlSession({ paneId, cols: 80, rows: 24, takeover: true }, events);
		await firstFrame;
		control.close();
		expect(await closed).toBe("detached");
	});

	it("takeover supersedes the attached controller; without it a second attach fails", async () => {
		const first = recorder();
		const a = startControlSession({ paneId, cols: 80, rows: 24, takeover: true }, first.events);
		await first.firstFrame;
		const refused = recorder();
		startControlSession({ paneId, cols: 80, rows: 24, takeover: false }, refused.events);
		expect(await refused.closed).toMatch(/already has an attached client/);
		const second = recorder();
		const b = startControlSession({ paneId, cols: 80, rows: 24, takeover: true }, second.events);
		expect(await first.closed).toMatch(/taken over/);
		expect((await second.firstFrame).full).toBe(true);
		a.close();
		b.close();
		expect(await second.closed).toBe("detached");
	});

	it("two subscribers share one observe process, which exits after both leave", async () => {
		const children: ChildProcessWithoutNullStreams[] = [];
		const pool = new ObservePool({
			start: (pane, size, events) =>
				startObserveSession(pane, size, events, (args) => {
					const child = spawnHerdr(args);
					children.push(child);
					return child;
				}),
			resolveSize: ptySizeOf,
			lingerMs: 300,
		});
		const writes: boolean[] = [];
		const sink: ScreenSink = { ...nullSink, write: (_k, _i, _b, reset) => writes.push(reset) };
		pool.subscribe(sink, "monitor", paneId);
		pool.subscribe(sink, "tile", paneId);
		await waitFor(() => (writes.length > 0 ? true : undefined), "first observe frame");
		expect(children).toHaveLength(1);
		const [child] = children;
		expect(child?.exitCode).toBeNull();
		const exited = Promise.withResolvers<void>();
		child?.once("exit", () => exited.resolve());
		pool.unsubscribe(1, "monitor", paneId);
		pool.unsubscribe(1, "tile", paneId);
		await exited.promise;
		expect(children).toHaveLength(1);
		expect(pool.runningPanes()).toEqual([]);
	});
});
