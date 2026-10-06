import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { consoleSink, formatRecord } from "./console-sink";
import {
	createLogger,
	type LogRecord,
	parseLogLevel,
	serializeError,
	setLogLevel,
	setLogSinks,
} from "./logger";

let records: LogRecord[] = [];

beforeEach(() => {
	records = [];
	setLogSinks([(record) => records.push(record)]);
	setLogLevel("debug");
});

afterEach(() => {
	setLogSinks([consoleSink]);
	setLogLevel("info");
});

describe("level filtering", () => {
	it("drops records below the minimum level and keeps the rest", () => {
		setLogLevel("warn");
		const log = createLogger("test");
		log.debug("d");
		log.info("i");
		log.warn("w");
		log.error("e");
		expect(records.map((r) => [r.level, r.message])).toEqual([
			["warn", "w"],
			["error", "e"],
		]);
	});

	it("reads the level from env-style strings and rejects unknown names", () => {
		expect(parseLogLevel(" DEBUG ")).toBe("debug");
		expect(parseLogLevel("verbose")).toBeUndefined();
		expect(parseLogLevel(undefined)).toBeUndefined();
	});
});

describe("scopes", () => {
	it("joins child scopes with a colon, at any depth", () => {
		const mailbox = createLogger("switchboard").child("mailbox");
		mailbox.info("read");
		mailbox.child("tail").info("tick");
		expect(mailbox.scope).toBe("switchboard:mailbox");
		expect(records.map((r) => r.scope)).toEqual([
			"switchboard:mailbox",
			"switchboard:mailbox:tail",
		]);
	});
});

describe("error serialization", () => {
	it("flattens an Error passed as fields into name, message, stack and cause", () => {
		const cause = new TypeError("socket closed");
		const error = Object.assign(new Error("read failed", { cause }), { code: "EPIPE" });
		createLogger("test").warn("boom", error);
		expect(records[0]?.fields).toEqual({
			error: {
				name: "Error",
				message: "read failed",
				code: "EPIPE",
				stack: error.stack,
				cause: { name: "TypeError", message: "socket closed", stack: cause.stack },
			},
		});
	});

	it("serializes Error values inside fields and leaves other values untouched", () => {
		createLogger("test").warn("boom", { agent: "kim", error: new RangeError("nope"), n: 3 });
		expect(records[0]?.fields).toMatchObject({
			agent: "kim",
			n: 3,
			error: { name: "RangeError", message: "nope" },
		});
	});

	it("cuts a self-referencing cause chain off as a string after a few levels", () => {
		const error = new Error("loop");
		error.cause = error;
		let node: unknown = serializeError(error);
		let depth = 0;
		while (typeof node === "object" && node !== null && "cause" in node) {
			node = node.cause;
			depth += 1;
		}
		expect(node).toBe("Error: loop");
		expect(depth).toBe(6);
	});
});

describe("sinks", () => {
	it("sends every record to all current sinks, and only to them after a swap", () => {
		const first: string[] = [];
		const second: string[] = [];
		setLogSinks([(r) => first.push(r.message)]);
		createLogger("test").info("one");
		setLogSinks([(r) => second.push(r.message), (r) => second.push(`${r.message}!`)]);
		createLogger("test").info("two");
		expect(first).toEqual(["one"]);
		expect(second).toEqual(["two", "two!"]);
	});

	it("formats `HH:MM:SS.mmm LEVEL scope message {fields}` with stacks on following lines", () => {
		const record: LogRecord = {
			time: new Date(2026, 9, 6, 7, 5, 3, 9),
			level: "warn",
			scope: "workforce",
			message: "agent failed to start",
			fields: { agent: "kim", error: { name: "Error", message: "x", stack: "Error: x\n    at y" } },
		};
		expect(formatRecord(record)).toBe(
			'07:05:03.009 WARN  workforce agent failed to start {"agent":"kim","error":{"name":"Error","message":"x"}}\nError: x\n    at y',
		);
	});
});
