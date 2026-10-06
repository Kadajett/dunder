import { describe, expect, it } from "vitest";
import { latestOnly } from "./create";

describe("latestOnly", () => {
	it("never overlaps writes and skips values superseded while one runs", async () => {
		const written: string[] = [];
		let active = 0;
		let overlapped = false;
		const gates: (() => void)[] = [];
		const save = latestOnly(async (value: string) => {
			active += 1;
			overlapped ||= active > 1;
			const gate = Promise.withResolvers<void>();
			gates.push(gate.resolve);
			await gate.promise;
			written.push(value);
			active -= 1;
		});
		const saves = [save("a"), save("b"), save("c")];
		for (let round = 0; round < 10; round += 1) {
			gates.shift()?.();
			const tick = Promise.withResolvers<void>();
			setImmediate(tick.resolve);
			await tick.promise;
		}
		await Promise.all(saves);
		expect(written).toEqual(["a", "c"]);
		expect(overlapped).toBe(false);
	});

	it("still writes a newer value after a failed write, and reports the failure", async () => {
		const written: string[] = [];
		const save = latestOnly(async (value: string) => {
			await Promise.resolve();
			if (value === "bad") throw new Error("disk full");
			written.push(value);
		});
		const failing = save("bad");
		const next = save("good");
		await expect(failing).rejects.toThrow("disk full");
		await expect(next).rejects.toThrow("disk full");
		expect(written).toEqual(["good"]);
		await expect(save("again")).resolves.toBeUndefined();
	});
});
