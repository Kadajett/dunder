import { useEffect, useState } from "react";
import { listInputs, MIC_TEST_MS, type MicInput, savedMicId, testMic } from "./call-mic";
import { chooseMic, useCall } from "./call-store";
import { LevelMeter } from "./LevelMeter";

type TestState = "idle" | "recording" | "playing";

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
		// Labels appear once the mic is open, so re-read when it changes.
	}, [micId]);
	return inputs;
}

/** Mic check in the call strip: pick the input, watch it move, hear yourself back. */
export function MicPopover({ onClose }: { readonly onClose: () => void }) {
	const inputs = useInputs();
	const mic = useCall((state) => state.mic);
	const error = useCall((state) => state.error);
	const [test, setTest] = useState<TestState>("idle");
	const chosen = mic?.deviceId ?? savedMicId();
	const runTest = async () => {
		setTest("recording");
		const playing = window.setTimeout(() => setTest("playing"), MIC_TEST_MS);
		await testMic().finally(() => {
			window.clearTimeout(playing);
			setTest("idle");
		});
	};
	return (
		<div className="chief-mic" role="dialog" aria-label="Microphone">
			<header className="chief-mic__header">
				<span>Microphone</span>
				<button type="button" className="chief-mic__close" aria-label="Close" onClick={onClose}>
					×
				</button>
			</header>
			<ul className="chief-mic__inputs">
				{inputs.map((input) => (
					<li key={input.deviceId}>
						<label>
							<input
								type="radio"
								name="chief-mic"
								checked={input.deviceId === chosen}
								onChange={() => void chooseMic(input.deviceId)}
							/>
							{input.label}
						</label>
					</li>
				))}
				{inputs.length === 0 && <li className="chief-mic__empty">No audio inputs found.</li>}
			</ul>
			<LevelMeter />
			<p className="chief-mic__using">
				{mic ? `Using: ${mic.label || "the default input"}` : "No mic open"}
			</p>
			{error && <p className="chief-call__error">{error}</p>}
			<button
				type="button"
				className="chief-mic__test"
				disabled={!mic || test !== "idle"}
				onClick={() => void runTest()}
			>
				{test === "recording"
					? "Say something… (3 s)"
					: test === "playing"
						? "Playing it back…"
						: "Test: record 3 s and play back"}
			</button>
		</div>
	);
}
