import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, createServer, preview } from "vite";
import { z } from "zod";
import type { Logger } from "../src/shared/log/logger.ts";
import { Cdp, findChrome, launchChrome } from "./scene-shot/cdp.ts";

let log: Logger | undefined;
let cdp: Cdp | undefined;
let chrome: Awaited<ReturnType<typeof launchChrome>> | undefined;
let server: Awaited<ReturnType<typeof createServer>> | undefined;
let previewServer: Awaited<ReturnType<typeof preview>> | undefined;
let outputDirectory: string | undefined;
const targetSchema = z.object({ targetId: z.string() });
const sessionSchema = z.object({ sessionId: z.string() });
const evaluateSchema = z.object({ result: z.object({ value: z.unknown().optional() }) });
const requestSchema = z.object({ request: z.object({ url: z.string() }) });
const configFile = fileURLToPath(new URL("./scene-shot/vite.config.ts", import.meta.url));
const fixtureRoot = fileURLToPath(new URL("./scene-shot/page", import.meta.url));
function isLoggerModule(value: unknown): value is {
	readonly createLogger: (scope: string) => Logger;
} {
	return (
		typeof value === "object" &&
		value !== null &&
		"createLogger" in value &&
		typeof value.createLogger === "function"
	);
}

try {
	server = await createServer({ configFile, root: fixtureRoot });
	await server.listen();
	const loggerModule: unknown = await server.ssrLoadModule("@shared/log/logger");
	if (!isLoggerModule(loggerModule)) throw new Error("logger module did not expose createLogger");
	const logger = loggerModule.createLogger("whiteboard-font-check");
	log = logger;
	await server.close();
	server = undefined;

	outputDirectory = await mkdtemp(join(tmpdir(), "whiteboard-font-check-"));
	await build({
		root: fixtureRoot,
		configFile,
		base: "./",
		build: {
			emptyOutDir: true,
			outDir: outputDirectory,
			rollupOptions: { input: join(fixtureRoot, "font-check.html") },
		},
	});
	previewServer = await preview({
		configFile,
		root: fixtureRoot,
		build: { outDir: outputDirectory },
		preview: { host: "127.0.0.1", port: 0 },
	});
	const baseUrl = previewServer.resolvedUrls?.local[0];
	if (!baseUrl) throw new Error("Vite preview did not report a local URL");
	const pageUrl = new URL("font-check.html", baseUrl).href;
	const localOrigin = new URL(baseUrl).origin;
	const requests = new Set<string>();
	chrome = await launchChrome(findChrome(process.env));
	cdp = await Cdp.connect(chrome.endpoint, (method, params) => {
		if (method !== "Network.requestWillBeSent") return;
		const parsed = requestSchema.safeParse(params);
		if (parsed.success) requests.add(parsed.data.request.url);
	});
	const { targetId } = await cdp.send(targetSchema, "Target.createTarget", { url: "about:blank" });
	const { sessionId } = await cdp.send(sessionSchema, "Target.attachToTarget", {
		targetId,
		flatten: true,
	});
	await cdp.send(z.object({}), "Network.enable", {}, sessionId);
	await cdp.send(z.object({}), "Runtime.enable", {}, sessionId);
	await cdp.send(z.object({}), "Page.navigate", { url: pageUrl }, sessionId);

	const deadline = Date.now() + 30_000;
	let result = "";
	while (Date.now() < deadline) {
		const evaluated = await cdp.send(
			evaluateSchema,
			"Runtime.evaluate",
			{
				expression: "document.documentElement.dataset.fontCheck ?? ''",
				returnByValue: true,
			},
			sessionId,
		);
		result = typeof evaluated.result.value === "string" ? evaluated.result.value : "";
		if (result) break;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	if (result !== "passed") throw new Error(result || "font render did not finish");

	const offOrigin = [...requests].filter((url) => {
		const parsed = new URL(url);
		return parsed.protocol !== "data:" && parsed.origin !== localOrigin;
	});
	if (offOrigin.length > 0) {
		throw new Error(
			`off-origin requests (${offOrigin.length}): ${offOrigin.slice(0, 5).join(", ")}`,
		);
	}
	const localXiaolaiFonts = [...requests].filter((url) =>
		url.includes("/excalidraw-assets/fonts/Xiaolai/"),
	);
	if (localXiaolaiFonts.length === 0) throw new Error("no local Xiaolai font request was observed");
	logger.info("packaged whiteboard font render passed", {
		localXiaolaiFonts: localXiaolaiFonts.length,
		requests: requests.size,
	});
} catch (error) {
	if (log) log.error("packaged whiteboard font render failed", { error });
	else process.stderr.write(`packaged whiteboard font render failed: ${String(error)}\n`);
	process.exitCode = 1;
} finally {
	cdp?.close();
	await chrome?.stop();
	await previewServer?.httpServer.close();
	if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
}
