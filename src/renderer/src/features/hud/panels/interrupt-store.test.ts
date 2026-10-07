import { describe, expect, it } from "vitest";
import { afterStatus } from "./interrupt-store";

describe("afterStatus", () => {
	it("keeps the mark while the agent writes its report, and drops it when that turn ends", () => {
		const start = { phase: "interrupted", sawWorking: false } as const;
		expect(afterStatus(start, "idle")).toBe(start);
		const reporting = afterStatus(start, "working");
		expect(reporting).toEqual({ phase: "interrupted", sawWorking: true });
		expect(afterStatus(reporting, "working")).toBe(reporting);
		expect(afterStatus(reporting, "done")).toBeUndefined();
	});

	it("leaves other phases alone", () => {
		const confirm = { phase: "confirm" } as const;
		expect(afterStatus(confirm, "idle")).toBe(confirm);
		expect(afterStatus(undefined, "working")).toBeUndefined();
	});
});
