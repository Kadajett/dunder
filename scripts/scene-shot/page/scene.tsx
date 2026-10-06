import "./fake-office";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@renderer/styles.css";
import { createRoot } from "react-dom/client";
import { Scene } from "./office-scene";

/** Frames to let characters settle, troika text load and shadows resolve before the shot. */
const SETTLE_FRAMES = 120;
const SETTLE_MS = 1_500;

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
