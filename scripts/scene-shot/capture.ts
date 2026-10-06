import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";
import { Cdp, findChrome, launchChrome } from "./cdp";

const log = createLogger("scene-shot");

const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 250;
const READY_EXPRESSION = 'document.body?.dataset.sceneReady === "true"';

interface Shot {
	/** Page under scripts/scene-shot/page/. */
	readonly page: string;
	/** Output, relative to the repo root. */
	readonly out: string;
	readonly width: number;
	readonly height: number;
	readonly scale: number;
}

/** Order matters: the comparison page shows the office shot taken just before it. */
const SHOTS: readonly Shot[] = [
	// 1600×1000 CSS px at 1.4× is 2240×1400, the reference's width.
	{
		page: "scene.html",
		out: "docs/screenshots/m5-office.png",
		width: 1600,
		height: 1000,
		scale: 1.4,
	},
	// The capture is clipped to the page's content height, so this height is a minimum.
	{
		page: "compare.html",
		out: "docs/screenshots/m5-vs-reference.png",
		width: 2400,
		height: 600,
		scale: 1,
	},
];

const targetSchema = z.object({ targetId: z.string() });
const sessionSchema = z.object({ sessionId: z.string() });
const evaluateSchema = z.object({ result: z.object({ value: z.unknown().optional() }) });
const metricsSchema = z.object({
	cssContentSize: z.object({ width: z.number(), height: z.number() }),
});
const screenshotSchema = z.object({ data: z.string() });
const ignore = z.unknown();
const exceptionSchema = z.object({
	exceptionDetails: z.object({
		text: z.string(),
		exception: z.object({ description: z.string().optional() }).optional(),
	}),
});

/** Uncaught page errors would otherwise vanish with the headless tab. */
function onEvent(method: string, params: unknown): void {
	if (method !== "Runtime.exceptionThrown") return;
	const details = exceptionSchema.safeParse(params).data?.exceptionDetails;
	log.warn("page error", { error: details?.exception?.description ?? details?.text });
}

async function waitReady(cdp: Cdp, sessionId: string, page: string): Promise<void> {
	const deadline = Date.now() + READY_TIMEOUT_MS;
	const params = { expression: READY_EXPRESSION, returnByValue: true };
	let lastError: unknown;
	while (Date.now() < deadline) {
		// Vite may reload the page (first-run dependency optimisation), which destroys the
		// execution context mid-evaluate; that just means "not ready yet".
		const ready = await cdp
			.send(evaluateSchema, "Runtime.evaluate", params, sessionId)
			.then(({ result }) => result.value === true)
			.catch((error: unknown) => {
				lastError = error;
				return false;
			});
		if (ready) return;
		const pause = Promise.withResolvers<void>();
		setTimeout(pause.resolve, READY_POLL_MS);
		await pause.promise;
	}
	throw new Error(`${page} was not ready after ${READY_TIMEOUT_MS / 1000}s`, { cause: lastError });
}

async function capture(cdp: Cdp, baseUrl: string, shot: Shot): Promise<Buffer> {
	const { targetId } = await cdp.send(targetSchema, "Target.createTarget", { url: "about:blank" });
	const attach = { targetId, flatten: true };
	const { sessionId } = await cdp.send(sessionSchema, "Target.attachToTarget", attach);
	const metrics = { width: shot.width, height: shot.height, deviceScaleFactor: shot.scale };
	await cdp.send(
		ignore,
		"Emulation.setDeviceMetricsOverride",
		{ ...metrics, mobile: false },
		sessionId,
	);
	await cdp.send(ignore, "Runtime.enable", {}, sessionId);
	await cdp.send(ignore, "Page.navigate", { url: new URL(shot.page, baseUrl).href }, sessionId);
	await waitReady(cdp, sessionId, shot.page);
	const { cssContentSize } = await cdp.send(metricsSchema, "Page.getLayoutMetrics", {}, sessionId);
	const clip = {
		x: 0,
		y: 0,
		width: shot.width,
		height: Math.ceil(cssContentSize.height),
		scale: 1,
	};
	const { data } = await cdp.send(
		screenshotSchema,
		"Page.captureScreenshot",
		{ format: "png", clip, captureBeyondViewport: true },
		sessionId,
	);
	await cdp.send(ignore, "Target.closeTarget", { targetId });
	return Buffer.from(data, "base64");
}

/** Renders each scene-shot page in headless Chrome and writes the PNGs under `repo`. */
export async function captureAll(baseUrl: string, repo: string): Promise<void> {
	const chromePath = findChrome(process.env);
	log.info("launching headless Chrome", { chromePath });
	const chrome = await launchChrome(chromePath);
	const cdp = await Cdp.connect(chrome.endpoint, onEvent);
	try {
		for (const shot of SHOTS) {
			const started = Date.now();
			const png = await capture(cdp, baseUrl, shot);
			const out = join(repo, shot.out);
			await mkdir(dirname(out), { recursive: true });
			await writeFile(out, png);
			log.info("wrote", { out: shot.out, bytes: png.length, ms: Date.now() - started });
		}
	} finally {
		cdp.close();
		await chrome.stop();
	}
}
