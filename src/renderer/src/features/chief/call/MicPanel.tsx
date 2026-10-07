import { useEffect, useState } from "react";
import { listInputs, MIC_TEST_MS, type MicInput, savedMicId, testMic } from "./call-mic";
import { chooseMic, useCall } from "./call-store";

type TestState = "idle" | "recording" | "playing";

const testLabel: Readonly<Record<TestState, string>> = {
	idle: "Test: record 3 s and play back",
	recording: "Say something… (3 s)",
	playing: "Playing it back…",
};

/** The inputs the system offers, re-read when devices come and go. */
function useInputs(): readonly MicInput[] {
	const [inputs, setInputs] = useState<readonly MicInput[]>([]);
	const micId = useCall((state) => state.mic?.deviceId);
	// biome-ignore lint/correctness/useExhaustiveDependencies: labels appear once the mic opens, so re-read when it changes
	useEffect(() => {
		let live = true;
		const load = () =>
			void listInputs()
				.then((found) => live && setInputs(found))
				.catch(() => undefined);
		load();
		navigator.mediaDevices.addEventListener("devicechange", load);
		return () => {
			live = false;
			navigator.mediaDevices.removeEventListener("devicechange", load);
		};
	}, [micId]);
	return inputs;
}

/**
 * Mic check inside the call strip (in place of what was heard, under the
 * strip's own level meter): pick the input, watch the meter move, hear
 * yourself back. Inline, so the chat above stays readable.
 */
export function MicPanel({ onClose }: { readonly onClose: () => void }) {
	const inputs = useInputs();
	const mic = useCall((state) => state.mic);
	const [test, setTest] = useState<TestState>("idle");
	const chosen = mic?.deviceId ?? savedMicId() ?? "";
	const runTest = async () => {
		setTest("recording");
		const playing = window.setTimeout(() => setTest("playing"), MIC_TEST_MS);
		await testMic().finally(() => {
			window.clearTimeout(playing);
			setTest("idle");
		});
	};
	return (
		<fieldset className="chief-mic" aria-label="Microphone">
			<div className="chief-mic__row">
				<select
					className="chief-mic__select"
					aria-label="Microphone input"
					value={chosen}
					disabled={inputs.length === 0}
					onChange={(event) => void chooseMic(event.target.value)}
				>
					{inputs.length === 0 && <option value="">No audio inputs found</option>}
					{inputs.map((input) => (
						<option key={input.deviceId} value={input.deviceId}>
							{input.label}
						</option>
					))}
				</select>
				<button type="button" className="chief-mic__close" aria-label="Close" onClick={onClose}>
					×
				</button>
			</div>
			<div className="chief-mic__row">
				<button
					type="button"
					className="chief-mic__test"
					disabled={!mic || test !== "idle"}
					onClick={() => void runTest()}
				>
					{testLabel[test]}
				</button>
				{!mic && <span className="chief-mic__using">No mic open</span>}
			</div>
		</fieldset>
	);
}
