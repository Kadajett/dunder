import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CallSnapshot } from "@shared/voice";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { markUpdateRelaunch, takeUpdateRelaunch } from "../app-update/relaunch-mark";
import { CALL_RESUME_WINDOW_MS, CallKeeper, callToResume } from "./call-keeper";

const call: CallSnapshot = { muted: true, deviceId: "usb-mic", startedAt: 1_000 };

describe("callToResume", () => {
	it("picks a call back up only after an update relaunch moments ago", () => {
		expect(callToResume(call, 50_000, 58_000)).toEqual({ ...call, downAt: 50_000 });
		expect(callToResume(call, null, 58_000)).toBeNull();
		expect(callToResume(null, 50_000, 58_000)).toBeNull();
		expect(callToResume(call, 50_000, 50_000 + CALL_RESUME_WINDOW_MS + 1)).toBeNull();
		expect(callToResume(call, 50_000, 49_000)).toBeNull();
	});
});

describe("CallKeeper across a relaunch", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "call-keeper-"));
	});
	afterEach(() => rm(dir, { recursive: true, force: true }));

	const launch = (now: number) =>
		new CallKeeper({
			path: join(dir, "call.json"),
			relaunchedAt: () => takeUpdateRelaunch(dir),
			now: () => now,
		});

	it("resumes the saved call once after an update relaunch, never after a plain restart", async () => {
		const before = launch(0);
		await before.save(call);
		await markUpdateRelaunch(dir, 10_000);
		const after = launch(14_000);
		expect(await after.take()).toEqual({ ...call, downAt: 10_000 });
		expect(await after.take()).toBeNull();
		// The mark was used up: quitting and opening the app again doesn't call back.
		expect(await launch(20_000).take()).toBeNull();
	});

	it("doesn't resume a call that was hung up before the update", async () => {
		const before = launch(0);
		await before.save(call);
		await before.save(null);
		await markUpdateRelaunch(dir, 10_000);
		expect(await launch(14_000).take()).toBeNull();
	});
});
