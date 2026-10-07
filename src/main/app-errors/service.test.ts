import { EventEmitter } from "node:events";
import { consoleSink } from "@shared/log/console-sink";
import { type LogRecord, setLogSinks } from "@shared/log/logger";
import type { WebContents } from "electron";
import { afterEach, describe, expect, it } from "vitest";
import { AppErrorsService, watchPageErrors } from "./service";

afterEach(() => setLogSinks([consoleSink]));

describe("renderer console error handling", () => {
	it("logs third-party errors without adding them to the Trust Inbox", () => {
		const records: LogRecord[] = [];
		setLogSinks([(record) => records.push(record)]);
		const errors = new AppErrorsService({ emit: () => {}, now: () => 1 });
		const contents = new EventEmitter() as unknown as WebContents;
		watchPageErrors(contents, errors);

		contents.emit("console-message", {
			level: "error",
			message: "font loading failed",
			sourceId: "https://esm.sh/@excalidraw/excalidraw/index.js",
		});
		contents.emit("console-message", {
			level: "error",
			message: "application failure",
			sourceId: "file:///app/out/app.js",
		});

		expect(errors.list().map((error) => error.message)).toEqual(["application failure"]);
		expect(records).toMatchObject([
			{ level: "warn", message: "third-party renderer console error" },
			{ level: "error", message: "application failure" },
		]);
		errors.report({ message: "uncaught", where: "window" });
		errors.report({ message: "boundary failure", where: "boundary:whiteboard" });
		expect(errors.list().map((error) => error.where)).toEqual([
			"boundary:whiteboard",
			"window",
			"console",
		]);
		errors.stop();
	});
});
