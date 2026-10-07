import { useChief } from "@renderer/features/chief/chief-store";
import { useHud } from "@renderer/features/hud/view-store";
import { useSelection } from "@renderer/features/office/interaction/selection-store";
import { useWork } from "@renderer/features/work/work-store";
import { qa } from "./fake-office-hud";
import { micPicker, soundsOffCall } from "./qa-hud-call";
import { workUndo } from "./qa-hud-work";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, timeout = 10_000): Promise<boolean> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (check()) return true;
		await wait(50);
	}
	return check();
}

function assert(condition: boolean, message: string): void {
	if (!condition) qa.failures.push(message);
}

function button(label: string): HTMLButtonElement | null {
	return (
		[...document.querySelectorAll("button")].find(
			(candidate) => candidate.textContent?.trim() === label,
		) ?? null
	);
}

function clickButton(label: string): void {
	const target = button(label);
	assert(target !== null, `missing button: ${label}`);
	target?.click();
}

async function planProposed(): Promise<void> {
	assert(
		await until(() => document.querySelector('[aria-label="Today\'s plan"]') !== null),
		"plan card did not load",
	);
	assert(
		document.querySelector(".plan__focus")?.textContent === "Ship the critical work",
		"proposal focus not rendered",
	);
	assert(
		document.querySelector(".plan__not-today")?.textContent?.includes("Polish the pool table") ??
			false,
		"not-today item not rendered",
	);
}

async function editPlan(): Promise<void> {
	await planProposed();
	clickButton("Edit");
	assert(
		await until(() => document.querySelector<HTMLInputElement>(".plan__focus-input") !== null),
		"plan focus edit input missing",
	);
	const input = document.querySelector<HTMLInputElement>(".plan__focus-input");
	if (!input) return;
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, "Ship the tested plan");
	input.dispatchEvent(new Event("input", { bubbles: true }));
	clickButton("Save");
	assert(
		await until(() => qa.calls.includes("plan.edit:Ship the tested plan")),
		"plan edit API was not called",
	);
	assert(
		await until(
			() => document.querySelector(".today__focus")?.textContent === "Ship the tested plan",
		),
		"edited plan not shown in Today pill",
	);
	document.querySelector<HTMLButtonElement>(".today__pill")?.click();
	assert(
		await until(() => document.querySelector(".today__items .today__lane") !== null),
		"Today pill did not expose live bead lane",
	);
	assert(
		document.querySelector(".today__lane")?.textContent?.trim() === "in progress",
		"Today pill showed the wrong live lane",
	);
}

async function dayEnd(): Promise<void> {
	assert(
		await until(() => document.querySelector(".day-end") !== null),
		"day-end wrap did not load",
	);
	assert(
		document.querySelector(".day-end")?.textContent?.includes("AI spend today ~$12.35") ?? false,
		"day-end spend not rendered",
	);
	clickButton("Got it");
	assert(
		await until(() => qa.calls.includes("wrap.dismiss")),
		"day-end dismiss API was not called",
	);
}

async function hoverBeadedAgent(): Promise<boolean> {
	const canvas = document.querySelector<HTMLCanvasElement>("canvas");
	if (!canvas) return false;
	const bounds = canvas.getBoundingClientRect();
	let lastPane = "";
	for (let y = bounds.top + 16; y < bounds.bottom; y += 64) {
		for (let x = bounds.left + 16; x < bounds.right; x += 64) {
			canvas.dispatchEvent(
				new PointerEvent("pointermove", {
					bubbles: true,
					clientX: x,
					clientY: y,
					pointerId: 1,
					pointerType: "mouse",
				}),
			);
			const selection = useSelection.getState().selection;
			if (selection?.kind !== "agent" || selection.paneId === lastPane) continue;
			lastPane = selection.paneId;
			await wait(30);
			if (
				document.querySelector(".agent-beads__item summary")?.textContent?.includes("office-k2p.3")
			)
				return true;
		}
	}
	return false;
}

async function agentCard(): Promise<void> {
	useSelection.getState().clear();
	assert(await hoverBeadedAgent(), "pointer sweep did not hover an agent with an in-progress bead");
	assert(
		await until(() => document.querySelector(".world-card") !== null),
		"agent card did not open from hover",
	);
	const details = document.querySelector<HTMLDetailsElement>(".agent-beads__item");
	assert(details !== null, "agent card has no in-progress bead details");
	const summary = details?.querySelector("summary")?.textContent ?? "";
	assert(
		summary.includes("office-k2p.3") &&
			summary.includes("Trust Inbox: group repeat app errors by region"),
		"agent card did not show the assigned bead id and title",
	);
	details?.querySelector("summary")?.click();
	assert(details?.open === true, "agent bead details did not expand");
	const detail = details?.querySelector(".agent-beads__detail")?.textContent ?? "";
	assert(
		detail.includes("Group errors by region") &&
			detail.includes("Three identical errors show as one card"),
		"agent bead description and acceptance criteria were not rendered",
	);
}

async function whatsNewFeedback(): Promise<void> {
	assert(
		await until(() => document.querySelector(".whats-new__review") !== null),
		"What's New card did not load",
	);
	document.querySelector<HTMLButtonElement>(".whats-new__review")?.click();
	const upSelector = '[aria-label="Good: office-7hk"]';
	assert(
		await until(() => document.querySelector(upSelector) !== null),
		"thumbs-up button missing",
	);
	document.querySelector<HTMLButtonElement>(upSelector)?.click();
	assert(
		await until(() => qa.calls.includes("whatsNew.rate:office-7hk:up:")),
		"thumbs-up did not call the rating API",
	);
	const downSelector = '[aria-label="Not right: office-j8s"]';
	assert(
		await until(() => document.querySelector(downSelector) !== null),
		"thumbs-down button missing",
	);
	document.querySelector<HTMLButtonElement>(downSelector)?.click();
	assert(
		await until(() => document.querySelector<HTMLInputElement>(".whats-new__note") !== null),
		"thumbs-down reason input missing",
	);
	const input = document.querySelector<HTMLInputElement>(".whats-new__note");
	if (!input) return;
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, "The step needs a clearer example");
	input.dispatchEvent(new Event("input", { bubbles: true }));
	input.blur();
	assert(
		await until(() =>
			qa.calls.includes("whatsNew.rate:office-j8s:down:The step needs a clearer example"),
		),
		"feedback reason was not submitted",
	);
	assert(
		await until(() =>
			qa.calls.includes(
				"chief.send:👎 office-j8s (Mic popover: test your mic before a call): The step needs a clearer example",
			),
		),
		"thumbs-down feedback did not call chief.send",
	);
	clickButton("Got it");
	assert(
		await until(() => qa.calls.includes("whatsNew.dismiss")),
		"Got it did not dismiss What's New",
	);
}

async function beadChips(): Promise<void> {
	useChief.getState().open();
	assert(
		await until(() => document.querySelectorAll(".chief-chat .bead-chip").length > 0),
		"chief bead chips did not render",
	);
	const board = useWork.getState().board;
	const cards = board?.state === "ok" ? board.cards : [];
	const ids = new Set(cards.map((card) => card.id));
	const chips = [...document.querySelectorAll<HTMLButtonElement>(".chief-chat .bead-chip")];
	const known = chips.find((chip) => ids.has(chip.textContent?.trim() ?? ""));
	assert(known !== undefined, "no known bead chip in chief history");
	known?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
	assert(
		Boolean(
			known?.title.toLowerCase().includes("trust inbox: group repeat app errors") &&
				known.title.toLowerCase().includes("in progress · theo"),
		),
		"known bead hover tooltip omitted title, lane, or assignee",
	);
	const knownId = known?.textContent?.trim();
	known?.click();
	assert(
		await until(
			() =>
				knownId !== undefined &&
				document.querySelector(".work-card--open .work-card__id")?.getAttribute("title") ===
					knownId,
		),
		"known bead click did not reveal its work card",
	);
	const detail = document.querySelector(".work-card--open .work-card__detail");
	assert(
		detail?.textContent?.includes("Group errors by region") === true &&
			detail.textContent.includes("Three identical errors show as one card"),
		"known bead click did not show its description and acceptance criteria",
	);
	const unknown = chips.find((chip) => !ids.has(chip.textContent?.trim() ?? ""));
	assert(unknown !== undefined, "no unknown bead chip in chief history");
	unknown?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
	assert(unknown?.title === "not on the board", "unknown bead hover tooltip was missing");
	unknown?.click();
	assert(
		await until(
			() =>
				qa.copied.includes(unknown?.textContent?.trim() ?? "") &&
				document.querySelector(".bead-chip-note")?.textContent?.includes("not on the board") ===
					true,
		),
		"unknown bead id was not copied with its notice",
	);
}

async function spendAlert(): Promise<void> {
	useHud.setState({ panel: "inbox" });
	assert(
		await until(() => document.querySelector('[data-kind="spend"]') !== null),
		"spend alert did not render in Trust Inbox",
	);
	assert(
		document.querySelector('[data-kind="spend"]')?.textContent?.includes("$7.42") ?? false,
		"spend alert omitted current cost",
	);
}

export const QA_STATES: Record<string, () => Promise<void>> = {
	"13-plan-proposed": planProposed,
	"13-plan-edit": editPlan,
	"14-day-end": dayEnd,
	"15-agent-card": agentCard,
	"16-whats-new-feedback": whatsNewFeedback,
	"17-bead-chips": beadChips,
	"18-mic-picker": micPicker,
	"19-spend-alert": spendAlert,
	"20-sounds-off-call": soundsOffCall,
	"21-work-undo": workUndo,
};
