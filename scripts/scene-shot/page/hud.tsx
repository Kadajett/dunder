import { POOL_PLAYING, refreshHeld, reports, setPool, unstubbed } from "./fake-office-hud";
import { batched, countdown } from "./hud-update-states";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@renderer/styles.css";
import { App } from "@renderer/app/App";
import { installErrorHooks } from "@renderer/features/errors/errors-store";
import { useHire } from "@renderer/features/hire/hire-store";
import { useHud } from "@renderer/features/hud/view-store";
import { useFocus } from "@renderer/features/office/focus/focus-store";
import { useTv } from "@renderer/features/office/tv/tv-store";
import { enterTableView } from "@renderer/features/pool/enter-table-view";
import { useWhatsNew } from "@renderer/features/whats-new/whats-new-store";
import { useWork } from "@renderer/features/work/work-store";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { agentCard } from "./hud-agent-card";
import { startCall } from "./hud-call";

/**
 * HUD screenshot harness page: the real <App/> over the stubbed
 * `window.office`, driven into one state per `?state=` and measured. The
 * capture script reads `window.__audit` once `data-scene-ready` is set.
 */

function wait(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

/** Frames to let characters settle, troika text load and shadows resolve before measuring. */
async function settleFrames(): Promise<void> {
	await document.fonts.ready;
	for (let frame = 0; frame < 120; frame += 1) {
		const next = Promise.withResolvers<number>();
		requestAnimationFrame(next.resolve);
		await next.promise;
	}
	await wait(1_500);
}

async function until(check: () => boolean, ms: number): Promise<boolean> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (check()) return true;
		await wait(100);
	}
	return check();
}

function click(selector: string): boolean {
	const element = document.querySelector<HTMLElement>(selector);
	element?.click();
	return element !== null;
}

function expandWork(): void {
	const work = useWork.getState();
	work.setOpen(true);
	work.filterAgent("theo");
	work.expand("office-k2p.3");
}

const notes: string[] = [];

async function poolTable(): Promise<void> {
	setPool(POOL_PLAYING);
	await wait(300);
	enterTableView({ center: { x: -11.3, z: -2.9 }, angle: Math.PI / 2 });
	const settled = await until(() => useFocus.getState().phase === "focused", 30_000);
	notes.push(`table view phase: ${useFocus.getState().phase} (settled=${settled})`);
}

/** A state shown with the notice slot empty (no What's new card over the top centre). */
const withoutNotices = (then: () => void) => async (): Promise<void> => {
	useWhatsNew.setState({ card: null });
	then();
};

const STATES: Record<string, () => Promise<void>> = {
	"01-default": async () => undefined,
	"01b-away": async () => useWhatsNew.setState({ card: null }),
	"01c-whats-new": async () => {
		await until(() => document.querySelector(".whats-new__review") !== null, 10_000);
		if (!click(".whats-new__review")) notes.push("what's new toggle not found");
		await wait(100);
		if (!click(".whats-new__others .whats-new__more")) notes.push("'Also changed' not found");
	},
	"02-inbox": async () => useHud.setState({ panel: "inbox" }),
	"02b-inbox-ask": async () => {
		useHud.setState({ panel: "inbox" });
		await until(() => document.querySelector('.hud-card[data-kind="ask"]') !== null, 10_000);
		document.querySelector('.hud-card[data-kind="ask"]')?.scrollIntoView({ block: "start" });
	},
	"03-team": async () => useHud.setState({ panel: "team" }),
	"04-brain": async () => useHud.setState({ panel: "brain" }),
	"05-clients": async () => useHud.setState({ panel: "clients" }),
	"06-work-expanded": async () => expandWork(),
	"07-call-dock": async () => {
		startCall();
		await wait(300);
		if (!click(".chief-call__mic")) notes.push("mic button not found");
	},
	"08-menu-update": async () => {
		countdown(600);
		await wait(200);
		if (!click('.hud-more > button[aria-haspopup="menu"]')) notes.push("menu button not found");
	},
	"09-pool-table": poolTable,
	"09b-pool-table-fresh": poolTable,
	"10-hire": async () => useHire.getState().show(),
	"11-everything": async () => {
		expandWork();
		useHud.setState({ panel: "inbox" });
		startCall();
	},
	"12-update-batched": withoutNotices(batched),
	// The wall TV on SHIPPING at the default camera: every figure must read without fullscreen.
	"13-tv-shipping": withoutNotices(() => useTv.getState().select("shipping")),
	// Evening: the fake posts Max's wrap-up and today's unrated 'Try these' for this state.
	"14-day-end": async () => undefined,
	"19-agent-card-hover-click": agentCard,
};

/** Last touches right before the shot, for state that runs out while the scene settles. */
const FINISH: Record<string, () => void> = {
	"08-menu-update": () => countdown(15),
};

/** Pieces that float inside the HUD's top-level layers, measured on their own. */
const NESTED = [
	".hud-topbar > *",
	".update-banner",
	".update-held",
	".hud-menu",
	".chief-chat",
	".chief__pill",
	".chief-call",
	".chief-mic",
	".pool-hud",
	".focus-bar",
	".world-card",
	".hire-dialog",
	".error-notice",
	".chief-chat > *",
];

interface Box {
	readonly name: string;
	readonly className: string;
	readonly label: string | null;
	readonly topLevel: boolean;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly text?: string;
}

interface Overlap {
	readonly a: string;
	readonly b: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** `aside.hud-panel[Trust Inbox]`: enough to tell the pieces apart in the report. */
function nameOf(element: Element): string {
	const first = typeof element.className === "string" ? element.className.split(/\s+/)[0] : "";
	const label = element.getAttribute("aria-label");
	return `${element.tagName.toLowerCase()}${first ? `.${first}` : ""}${label ? `[${label}]` : ""}`;
}

/** Layers covering (nearly) the whole viewport, e.g. the 3D canvas or a click-catching backdrop. */
const fullscreen = (rect: DOMRect) =>
	rect.width >= innerWidth * 0.9 && rect.height >= innerHeight * 0.9;

function measure(): { boxes: Box[]; overlaps: Overlap[] } {
	const app = document.querySelector(".office-app");
	const top = new Set(app?.children ?? []);
	const elements = [
		...new Set([...top, ...NESTED.flatMap((selector) => [...document.querySelectorAll(selector)])]),
	].filter((element) => {
		const rect = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		return (
			rect.width >= 1 &&
			rect.height >= 1 &&
			style.visibility !== "hidden" &&
			style.display !== "none"
		);
	});
	const boxes = elements.map((element): Box => {
		const rect = element.getBoundingClientRect();
		return {
			name: nameOf(element),
			className: typeof element.className === "string" ? element.className : "",
			label: element.getAttribute("aria-label"),
			topLevel: top.has(element),
			x: Math.round(rect.x),
			y: Math.round(rect.y),
			w: Math.round(rect.width),
			h: Math.round(rect.height),
			...(element.classList.contains("error-notice")
				? { text: element.textContent?.slice(0, 300) ?? "" }
				: {}),
		};
	});
	const overlaps: Overlap[] = [];
	const solid = elements.filter((element) => !fullscreen(element.getBoundingClientRect()));
	for (const [i, a] of solid.entries()) {
		for (const b of solid.slice(i + 1)) {
			if (a.contains(b) || b.contains(a)) continue;
			const ra = a.getBoundingClientRect();
			const rb = b.getBoundingClientRect();
			const x = Math.max(ra.left, rb.left);
			const y = Math.max(ra.top, rb.top);
			const w = Math.min(ra.right, rb.right) - x;
			const h = Math.min(ra.bottom, rb.bottom) - y;
			if (w >= 1 && h >= 1)
				overlaps.push({
					a: nameOf(a),
					b: nameOf(b),
					x: Math.round(x),
					y: Math.round(y),
					w: Math.round(w),
					h: Math.round(h),
				});
		}
	}
	return { boxes, overlaps };
}

declare global {
	interface Window {
		__audit?: {
			readonly state: string;
			readonly viewport: { readonly width: number; readonly height: number };
			readonly boxes: Box[];
			readonly overlaps: Overlap[];
			readonly notes: string[];
			readonly reports: unknown[];
			readonly unstubbed: string[];
			readonly crashed: string[];
			readonly failures: string[];
		};
	}
}

async function run(): Promise<void> {
	const state = new URLSearchParams(location.search).get("state") ?? "01-default";
	const scenario = STATES[state];
	if (!scenario) throw new Error(`unknown state ${state}`);
	await settleFrames();
	let scenarioFailure: string | undefined;
	try {
		await scenario();
	} catch (error) {
		scenarioFailure = error instanceof Error ? error.message : String(error);
	}
	await settleFrames();
	refreshHeld();
	FINISH[state]?.();
	await wait(400);
	window.__audit = {
		state,
		viewport: { width: innerWidth, height: innerHeight },
		...measure(),
		notes,
		reports,
		unstubbed,
		failures: scenarioFailure ? [scenarioFailure] : [],
		crashed: [...document.querySelectorAll(".error-notice")].map((el) => el.textContent ?? ""),
	};
	document.body.dataset["sceneReady"] = "true";
}

installErrorHooks();
const root = document.getElementById("root");
if (!root) throw new Error("hud.html is missing #root");
const container = root;
void document.fonts.load('13px "JetBrains Mono"').finally(() => {
	createRoot(container).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
	void run();
});
