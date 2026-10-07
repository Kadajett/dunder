import { setSoundsOn, soundsOn } from "@renderer/features/audio/sound-store";
import { useCall } from "@renderer/features/chief/call/call-store";
import { useChief } from "@renderer/features/chief/chief-store";
import { emit, qa } from "./fake-office-hud";

async function until(check: () => boolean, timeout = 10_000): Promise<boolean> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (check()) return true;
		await new Promise<void>((resolve) => setTimeout(resolve, 50));
	}
	return check();
}

function assert(condition: boolean, message: string): void {
	if (!condition) qa.failures.push(message);
}

export async function micPicker(): Promise<void> {
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

export async function soundsOffCall(): Promise<void> {
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
