import { setSoundsOn, soundsOn } from "@renderer/features/audio/sound-store";
import { useCall } from "@renderer/features/chief/call/call-store";
import { useChief } from "@renderer/features/chief/chief-store";
import { useHud } from "@renderer/features/hud/view-store";
import { useSelection } from "@renderer/features/office/interaction/selection-store";
import { useWork } from "@renderer/features/work/work-store";
import { emit, qa } from "./fake-office-hud";

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

async function agentCard(): Promise<void> {
	useSelection.getState().select({ kind: "agent", paneId: "w2:p1" });
	assert(
		await until(() => document.querySelector(".world-card") !== null),
		"agent card did not open",
	);
	const details = document.querySelector<HTMLDetailsElement>(".agent-beads__item");
	assert(details !== null, "agent card has no in-progress bead details");
	details?.querySelector("summary")?.click();
	assert(details?.open === true, "agent bead details did not expand");
	assert(
		details?.textContent?.includes("Acceptance criteria") ?? false,
		"acceptance criteria not rendered",
	);
}

async function whatsNewFeedback(): Promise<void> {
	assert(
		await until(() => document.querySelector(".whats-new__review") !== null),
		"What's New card did not load",
	);
	document.querySelector<HTMLButtonElement>(".whats-new__review")?.click();
	assert(
		await until(() => document.querySelector('[aria-label="Not right: office-7hk"]') !== null),
		"thumbs-down button missing",
	);
	const down = document.querySelector<HTMLButtonElement>('[aria-label="Not right: office-7hk"]');
	down?.click();
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
			qa.calls.includes("whatsNew.rate:office-7hk:down:The step needs a clearer example"),
		),
		"feedback reason was not submitted",
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
	known?.click();
	assert(
		await until(() => useWork.getState().expanded === known?.textContent?.trim()),
		"known bead did not expand its work card",
	);
	const unknown = chips.find((chip) => !ids.has(chip.textContent?.trim() ?? ""));
	assert(unknown !== undefined, "no unknown bead chip in chief history");
	unknown?.click();
	assert(
		await until(() => qa.copied.includes(unknown?.textContent?.trim() ?? "")),
		"unknown bead id was not copied",
	);
}

async function micPicker(): Promise<void> {
	useChief.getState().open();
	useCall.setState({
		availability: { available: true },
		active: true,
		since: Date.now(),
		phase: "listening",
		muted: false,
		mic: { deviceId: "default", label: "Default - Jabra Evolve2 65" },
		level: 0,
		heard: "",
		error: null,
		hint: null,
	});
	assert(
		await until(() => document.querySelector(".chief-call__mic") !== null),
		"call mic control did not render",
	);
	document.querySelector<HTMLElement>(".chief-call__mic")?.click();
	assert(
		await until(() => document.querySelector(".chief-mic") !== null),
		"mic picker did not open",
	);
	assert(
		await until(() => document.querySelectorAll(".chief-mic select option").length >= 3),
		"fake audio input devices were not listed",
	);
}
async function soundsOffCall(): Promise<void> {
	setSoundsOn(true);
	useChief.getState().open();
	assert(
		await until(
			() => document.querySelector<HTMLButtonElement>('[aria-label="Call Max"]') !== null,
		),
		"Call Max button missing",
	);
	document.querySelector<HTMLButtonElement>('[aria-label="Call Max"]')?.click();
	assert(await until(() => useCall.getState().active), "call did not start");
	document.querySelector<HTMLButtonElement>('.hud-more > button[aria-haspopup="menu"]')?.click();
	const toggleReady = await until(() =>
		[...document.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')].some((item) =>
			item.textContent?.includes("Sounds"),
		),
	);
	assert(toggleReady, "Sounds menu toggle missing");
	const toggle = [
		...document.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]'),
	].find((item) => item.textContent?.includes("Sounds"));
	toggle?.click();
	assert(
		!soundsOn() && localStorage.getItem("dunder.sounds") === "off",
		"Sounds toggle did not persist off",
	);
	emit("chief", {
		id: "qa-spoken-reply",
		author: "chief",
		text: "A voice reply",
		spoken: "The tested plan is ready.",
		at: Date.now() + 1,
	});
	assert(
		await until(() => document.querySelector(".chief-call__caption") !== null),
		"sounds-off reply was not captioned",
	);
	assert(
		document
			.querySelector(".chief-call__caption")
			?.textContent?.includes("The tested plan is ready.") ?? false,
		"caption omitted the spoken line",
	);
	assert(!qa.calls.includes("voice.speak"), "voice API called while Sounds was off");
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
};
