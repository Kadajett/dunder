import "./fake-office";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@renderer/styles.css";
import { useOfficeSession } from "@renderer/features/herdr/useOfficeSession";
import { useOfficeModel } from "@renderer/features/office/model/office-model";
import { OfficeView } from "@renderer/features/office/OfficeView";
import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import { createRoot } from "react-dom/client";

/** Frames to let characters settle, troika text load and shadows resolve before the shot. */
const SETTLE_FRAMES = 120;
const SETTLE_MS = 1_500;

/** The real office scene (no HUD) for the default layout, with the crew from the reference. */
function Scene() {
	const { snapshot } = useOfficeSession();
	const model = useOfficeModel(DEFAULT_LAYOUT, snapshot);
	return (
		<div className="office-app" data-view="office">
			<OfficeView layout={DEFAULT_LAYOUT} model={model} />
		</div>
	);
}

function nextFrame(): Promise<number> {
	const { promise, resolve } = Promise.withResolvers<number>();
	requestAnimationFrame(resolve);
	return promise;
}

async function settle(): Promise<void> {
	await document.fonts.ready;
	for (let frame = 0; frame < SETTLE_FRAMES; frame += 1) await nextFrame();
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, SETTLE_MS);
	await promise;
	// The capture script polls for this.
	document.body.dataset["sceneReady"] = "true";
}

const root = document.getElementById("root");
if (!root) throw new Error("scene.html is missing #root");
createRoot(root).render(<Scene />);
void settle();
