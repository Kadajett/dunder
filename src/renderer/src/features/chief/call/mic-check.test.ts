import { describe, expect, it } from "vitest";
import { worthSending } from "./call-turn";
import { isDeviceGone, micErrorMessage } from "./mic-errors";
import { encodeWav, rms } from "./wav";

const failure = (name: string, message = "") => Object.assign(new Error(message), { name });

describe("micErrorMessage", () => {
	it("words each getUserMedia failure plainly and names it", () => {
		expect(micErrorMessage(failure("NotFoundError"))).toMatch(
			/^No microphone found.*\(NotFoundError\)$/,
		);
		expect(micErrorMessage(failure("NotAllowedError"))).toMatch(
			/permission denied.*\(NotAllowedError\)$/,
		);
		expect(micErrorMessage(failure("NotReadableError"))).toMatch(
			/busy.*another app.*\(NotReadableError\)$/,
		);
		expect(micErrorMessage(failure("OverconstrainedError"))).toMatch(/chosen microphone is gone/);
	});

	it("never says just 'error' for an unknown failure", () => {
		expect(micErrorMessage(failure("WeirdError", "driver hiccup"))).toBe(
			"The microphone didn't start (WeirdError): driver hiccup",
		);
		expect(micErrorMessage("boom")).toBe("The microphone didn't start: boom");
	});

	it("falls back to the default input only when the chosen device is gone", () => {
		expect(isDeviceGone(failure("OverconstrainedError"))).toBe(true);
		expect(isDeviceGone(failure("NotFoundError"))).toBe(true);
		expect(isDeviceGone(failure("NotAllowedError"))).toBe(false);
	});
});

describe("worthSending", () => {
	it("drops noise-length transcripts, punctuation included", () => {
		expect(worthSending("对")).toBe(false);
		expect(worthSending(" uh. ")).toBe(false);
		expect(worthSending("Is the board fixed?")).toBe(true);
		expect(worthSending("yes")).toBe(true);
	});
});

describe("encodeWav", () => {
	it("writes a 16-bit mono PCM header and clamped samples", () => {
		const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000);
		const view = new DataView(wav.buffer);
		expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
		expect(new TextDecoder().decode(wav.slice(8, 16))).toBe("WAVEfmt ");
		expect([view.getUint16(22, true), view.getUint32(24, true), view.getUint16(34, true)]).toEqual([
			1, 16_000, 16,
		]);
		expect(view.getUint32(40, true)).toBe(8);
		expect([0, 1, 2, 3].map((index) => view.getInt16(44 + index * 2, true))).toEqual([
			0, 32767, -32768, 32767,
		]);
	});

	it("measures level as RMS", () => {
		expect(rms(new Float32Array([0.5, -0.5]))).toBe(0.5);
		expect(rms(new Float32Array())).toBe(0);
	});
});
