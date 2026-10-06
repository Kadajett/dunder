/** Frames to let characters settle, troika text load and shadows resolve before the shot. */
const SETTLE_FRAMES = 120;
const SETTLE_MS = 1_500;

function nextFrame(): Promise<number> {
	const { promise, resolve } = Promise.withResolvers<number>();
	requestAnimationFrame(resolve);
	return promise;
}

/** Waits for fonts and a settled scene, then flags the page ready for the capture script. */
export async function settle(): Promise<void> {
	await document.fonts.ready;
	for (let frame = 0; frame < SETTLE_FRAMES; frame += 1) await nextFrame();
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, SETTLE_MS);
	await promise;
	// The capture script polls for this.
	document.body.dataset["sceneReady"] = "true";
}
