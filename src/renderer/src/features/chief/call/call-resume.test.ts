import { describe, expect, it } from "vitest";
import { callSnapshot, missedSeconds } from "./call-resume";

describe("call resume", () => {
	const resume = { muted: false, deviceId: null, startedAt: 0, downAt: 10_000 };

	it("counts the seconds the call was down, never less than one", () => {
		expect(missedSeconds(resume, 17_600)).toBe(8);
		expect(missedSeconds(resume, 10_100)).toBe(1);
	});

	it("keeps only a live call, with the open mic or else the chosen one", () => {
		const live = { active: true, muted: true, mic: { deviceId: "usb" }, startedAt: 5 };
		expect(callSnapshot(live, "webcam")).toEqual({ muted: true, deviceId: "usb", startedAt: 5 });
		expect(callSnapshot({ ...live, mic: null }, "webcam")?.deviceId).toBe("webcam");
		expect(callSnapshot({ ...live, mic: { deviceId: undefined } }, null)?.deviceId).toBeNull();
		expect(callSnapshot({ ...live, active: false }, "webcam")).toBeNull();
	});
});
