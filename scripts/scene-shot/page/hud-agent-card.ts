import { useConversations } from "@renderer/features/office/conversations/conversation-store";
import { useSelection } from "@renderer/features/office/interaction/selection-store";
import type { OfficeMessage } from "@shared/switchboard";

const THOUGHT_TO = "qa-agent-card-954";
const HOVER_STEP = 48;

function wait(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	window.setTimeout(resolve, ms);
	return promise;
}

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(`agent-card QA: ${message}`);
}

function movePointer(canvas: HTMLCanvasElement, x: number, y: number): void {
	canvas.dispatchEvent(
		new PointerEvent("pointermove", {
			bubbles: true,
			clientX: x,
			clientY: y,
			pointerId: 1,
			pointerType: "mouse",
		}),
	);
}

async function hoverAgent(
	canvas: HTMLCanvasElement,
): Promise<{ readonly x: number; readonly y: number }> {
	const bounds = canvas.getBoundingClientRect();
	let target: { readonly x: number; readonly y: number } | undefined;
	for (let y = bounds.top + 16; y < bounds.bottom; y += HOVER_STEP) {
		for (let x = bounds.left + 16; x < bounds.right; x += HOVER_STEP) {
			movePointer(canvas, x, y);
			await wait(25);
			assert(useSelection.getState().selection === null, "hover changed world selection");
			assert(document.querySelector(".world-card") === null, "hover opened an agent card");
			const thought = document.querySelector(".speech-thought")?.textContent ?? "";
			if (target === undefined && thought.includes(THOUGHT_TO)) target = { x, y };
		}
	}
	assert(target !== undefined, "pointer sweep never revealed the agent's waiting thought");
	return target;
}

function clickCanvas(
	canvas: HTMLCanvasElement,
	point: { readonly x: number; readonly y: number },
): void {
	const event = {
		bubbles: true,
		clientX: point.x,
		clientY: point.y,
		button: 0,
		pointerId: 1,
		pointerType: "mouse",
	};
	canvas.dispatchEvent(new PointerEvent("pointerdown", { ...event, buttons: 1 }));
	canvas.dispatchEvent(new PointerEvent("pointerup", { ...event, buttons: 0 }));
	canvas.dispatchEvent(new MouseEvent("click", event));
}

async function until(check: () => boolean, timeout = 10_000): Promise<boolean> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (check()) return true;
		await wait(50);
	}
	return check();
}

/** Exercise character hover and click through the real OfficeView canvas. */
export async function agentCard(): Promise<void> {
	useSelection.getState().clear();
	const now = Date.now();
	const thought: OfficeMessage = {
		id: "qa-agent-card-954",
		from: "theo",
		to: THOUGHT_TO,
		text: "A queued message used to reveal only its waiting thought.",
		sentAt: new Date(now).toISOString(),
		state: "queued",
	};
	useConversations.getState().upsert(thought, now);
	const canvas = document.querySelector<HTMLCanvasElement>("canvas");
	assert(canvas !== null, "OfficeView canvas is missing");
	const target = await hoverAgent(canvas);
	movePointer(canvas, target.x, target.y);
	await wait(100);
	assert(
		(document.querySelector(".speech-thought")?.textContent ?? "").includes(THOUGHT_TO),
		"hover no longer reveals the waiting thought",
	);
	clickCanvas(canvas, target);
	assert(
		await until(() => document.querySelector(".world-card") !== null),
		"click did not open agent card",
	);
	assert(useSelection.getState().selection?.kind === "agent", "click did not select the agent");
	assert(
		document.querySelector(".agent-beads__item summary")?.textContent?.includes("office-k2p.3") ===
			true,
		"clicked agent card lost its in-progress bead",
	);
}
