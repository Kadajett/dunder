import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";
import { Cdp, findChrome, launchChrome } from "./cdp";

const log = createLogger("hud-shot");

/** Every state page/hud.tsx can drive the App into, in capture order. */
const STATES = [
	"01-default",
	"01b-away",
	"01c-whats-new",
	"02-inbox",
	"03-team",
	"04-brain",
	"05-clients",
	"06-work-expanded",
	"07-call-dock",
	"08-menu-update",
	"09-pool-table",
	"09b-pool-table-fresh",
	"10-hire",
	"11-everything",
];
const OUT_DIR = "docs/screenshots/hud";
const WIDTH = 1600;
const HEIGHT = 1000;
const TIMEZONE = "America/Los_Angeles";
const READY_TIMEOUT_MS = 180_000;
const READY_POLL_MS = 250;
const READY_EXPRESSION = 'document.body?.dataset.sceneReady === "true"';

const ignore = z.unknown();
const targetSchema = z.object({ targetId: z.string() });
const sessionSchema = z.object({ sessionId: z.string() });
const evaluateSchema = z.object({ result: z.object({ value: z.unknown().optional() }) });
const screenshotSchema = z.object({ data: z.string() });
const exceptionSchema = z.object({
	exceptionDetails: z.object({
		text: z.string(),
		exception: z.object({ description: z.string().optional() }).optional(),
	}),
});
const consoleSchema = z.object({
	type: z.string(),
	args: z.array(z.object({ value: z.unknown().optional() })),
});
const auditSchema = z
	.object({ overlaps: z.array(z.unknown()), crashed: z.array(z.string()) })
	.passthrough();

/** Page errors and console errors/warnings for the state being captured. */
const pageErrors: string[] = [];

function onEvent(method: string, params: unknown): void {
	if (method === "Runtime.exceptionThrown") {
		const details = exceptionSchema.safeParse(params).data?.exceptionDetails;
		pageErrors.push(details?.exception?.description ?? details?.text ?? "unknown");
	}
	if (method === "Runtime.consoleAPICalled") {
		const call = consoleSchema.safeParse(params).data;
		if (call && (call.type === "error" || call.type === "warning")) {
			const text = call.args.map((arg) => String(arg.value)).join(" ");
			pageErrors.push(`console.${call.type}: ${text.slice(0, 400)}`);
		}
	}
}

async function evaluate(cdp: Cdp, sessionId: string, expression: string): Promise<unknown> {
	const { result } = await cdp.send(
		evaluateSchema,
		"Runtime.evaluate",
		{ expression, returnByValue: true },
		sessionId,
	);
	return result.value;
}

async function waitReady(cdp: Cdp, sessionId: string): Promise<boolean> {
	const deadline = Date.now() + READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		// Vite may reload the page (dependency optimisation), destroying the context mid-evaluate.
		const ready = await evaluate(cdp, sessionId, READY_EXPRESSION).catch(() => false);
		if (ready === true) return true;
		const pause = Promise.withResolvers<void>();
		setTimeout(pause.resolve, READY_POLL_MS);
		await pause.promise;
	}
	return false;
}

interface Result {
	readonly state: string;
	readonly ready: boolean;
	readonly crashed: readonly string[];
}

async function shoot(cdp: Cdp, baseUrl: string, outDir: string, state: string): Promise<Result> {
	pageErrors.length = 0;
	const started = Date.now();
	const { targetId } = await cdp.send(targetSchema, "Target.createTarget", { url: "about:blank" });
	const { sessionId } = await cdp.send(sessionSchema, "Target.attachToTarget", {
		targetId,
		flatten: true,
	});
	await cdp.send(
		ignore,
		"Emulation.setDeviceMetricsOverride",
		{ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
		sessionId,
	);
	await cdp.send(ignore, "Emulation.setTimezoneOverride", { timezoneId: TIMEZONE }, sessionId);
	await cdp.send(ignore, "Runtime.enable", {}, sessionId);
	const url = new URL(`hud.html?state=${state}`, baseUrl).href;
	await cdp.send(ignore, "Page.navigate", { url }, sessionId);
	const ready = await waitReady(cdp, sessionId);
	const raw = await evaluate(cdp, sessionId, "JSON.stringify(window.__audit ?? null)");
	const { data } = await cdp.send(
		screenshotSchema,
		"Page.captureScreenshot",
		{ format: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 } },
		sessionId,
	);
	await cdp.send(ignore, "Target.closeTarget", { targetId });
	const audit =
		typeof raw === "string" ? (auditSchema.safeParse(JSON.parse(raw)).data ?? null) : null;
	const png = join(outDir, `${state}.png`);
	await writeFile(png, Buffer.from(data, "base64"));
	const report = { ...audit, ready: ready && audit !== null, pageErrors: [...pageErrors] };
	await writeFile(join(outDir, `${state}.json`), `${JSON.stringify(report, null, 2)}\n`);
	const result = { state, ready: report.ready, crashed: audit?.crashed ?? [] };
	log.info(`${state}: ${result.ready ? "ok" : "NOT READY"}`, {
		seconds: Math.round((Date.now() - started) / 1000),
		overlaps: audit?.overlaps.length ?? null,
		crashed: result.crashed,
		png,
	});
	return result;
}

/** Captures `states` (all when empty); resolves false if any was not ready or crashed. */
export async function captureHud(
	baseUrl: string,
	repo: string,
	states: readonly string[],
): Promise<boolean> {
	const unknown = states.filter((state) => !STATES.includes(state));
	if (unknown.length > 0) throw new Error(`hud-shot: unknown states ${unknown.join(", ")}`);
	const outDir = join(repo, OUT_DIR);
	await mkdir(outDir, { recursive: true });
	const chrome = await launchChrome(findChrome(process.env));
	const cdp = await Cdp.connect(chrome.endpoint, onEvent);
	const results: Result[] = [];
	try {
		for (const state of states.length > 0 ? states : STATES)
			results.push(await shoot(cdp, baseUrl, outDir, state));
	} finally {
		cdp.close();
		await chrome.stop();
	}
	const notReady = results.filter((result) => !result.ready).map((result) => result.state);
	const crashed = results.filter((result) => result.crashed.length > 0).map((r) => r.state);
	const ok = notReady.length === 0 && crashed.length === 0;
	const summary = { states: results.length, notReady, crashed, outDir };
	if (ok) log.info("hud-shot: all states ok", summary);
	else log.error("hud-shot: failures", summary);
	return ok;
}
