import { useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";

const SIZE = 256;

/**
 * The page behind the room: warm paper, brightest just above the room's centre
 * and falling off to a soft darker rim, like the reference. As `scene.background`
 * it is stretched over the viewport, so the vignette follows the window, not the camera.
 */
export function Backdrop() {
	const texture = useMemo(() => {
		const canvas = document.createElement("canvas");
		canvas.width = SIZE;
		canvas.height = SIZE;
		const context = canvas.getContext("2d");
		if (context) {
			const glow = context.createRadialGradient(
				SIZE / 2,
				SIZE * 0.42,
				SIZE * 0.08,
				SIZE / 2,
				SIZE / 2,
				SIZE * 0.75,
			);
			glow.addColorStop(0, "#fdfaf4");
			glow.addColorStop(0.55, "#f3eee4");
			glow.addColorStop(1, "#e2dacb");
			context.fillStyle = glow;
			context.fillRect(0, 0, SIZE, SIZE);
		}
		const result = new CanvasTexture(canvas);
		result.colorSpace = SRGBColorSpace;
		return result;
	}, []);
	return <primitive attach="background" object={texture} />;
}
