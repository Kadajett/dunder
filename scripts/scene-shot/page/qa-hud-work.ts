import { useWork } from "@renderer/features/work/work-store";
import { qa } from "./fake-office-hud";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean): Promise<boolean> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		if (check()) return true;
		await wait(50);
	}
	return check();
}

function assert(condition: boolean, message: string): void {
	if (!condition) qa.failures.push(message);
}

export async function workUndo(): Promise<void> {
	useWork.getState().setOpen(true);
	useWork.getState().filterAgent(null);
	const reviewCard = '[aria-label="Review"] .work-card__id[title="office-67k"]';
	assert(
		await until(() => document.querySelector(reviewCard) !== null),
		"office-67k review card did not render",
	);
	document
		.querySelector<HTMLElement>(reviewCard)
		?.closest(".work-card")
		?.querySelector<HTMLButtonElement>(".work-card__more")
		?.click();
	assert(
		await until(() =>
			[...document.querySelectorAll<HTMLButtonElement>("button")].some(
				(candidate) => candidate.textContent?.trim() === "Move to Done",
			),
		),
		"Move to Done menu item missing",
	);
	[...document.querySelectorAll<HTMLButtonElement>("button")]
		.find((candidate) => candidate.textContent?.trim() === "Move to Done")
		?.click();
	assert(
		await until(
			() =>
				document.querySelector(".work-undo__label")?.textContent?.includes("Moved 67k to Done") ??
				false,
		),
		"move did not show the Undo toast",
	);
	const board = useWork.getState().board;
	assert(
		board?.state === "ok" && board.cards.find((card) => card.id === "office-67k")?.lane === "done",
		"fake board did not move office-67k to Done",
	);
	document.querySelector<HTMLButtonElement>(".work-undo__button")?.click();
	assert(
		await until(
			() =>
				qa.calls.includes("work.move:office-67k:done") &&
				qa.calls.includes("work.move:office-67k:review") &&
				document.querySelector(".work-undo") === null,
		),
		"Undo did not restore office-67k to Review",
	);
	assert(document.querySelector(reviewCard) !== null, "office-67k did not return to Review");
}
