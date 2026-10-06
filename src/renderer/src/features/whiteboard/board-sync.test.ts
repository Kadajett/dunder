import type { WhiteboardChange } from "@shared/whiteboard";
import { describe, expect, it } from "vitest";
import { remoteStep } from "./board-sync";

const change = (cause: WhiteboardChange["cause"], companyId = "acme"): WhiteboardChange => ({
	board: { companyId, revision: 5, scene: null },
	cause,
});

describe("remoteStep", () => {
	it("merges agents' posts, ignores its own saves, reloads a cleared or another company's board", () => {
		expect(remoteStep(change({ kind: "note", by: "nora", records: [] }), "acme")).toEqual({
			kind: "merge",
			records: [],
			revision: 5,
		});
		expect(remoteStep(change({ kind: "editor" }), "acme").kind).toBe("ignore");
		expect(remoteStep(change({ kind: "clear", by: "max" }), "acme").kind).toBe("reload");
		expect(remoteStep(change({ kind: "note", by: "nora", records: [] }, "zeta"), "acme").kind).toBe(
			"reload",
		);
	});
});
