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

export interface Box {
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

export interface Overlap {
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

export function measureHud(): { boxes: Box[]; overlaps: Overlap[] } {
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
			if (w < 1 || h < 1) continue;
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
