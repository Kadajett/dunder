import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import type { ChannelId } from "./channels";
import { Pen, SCREEN_H, SCREEN_W } from "./paint/kit";
import type { TvInputs } from "./screen";
import { type PaintSurface, usePaintLoop } from "./usePaintLoop";

/** The wall TV's screen texture, repainted from `channel` + `inputs` whenever the picture changes. */
export function useTvTexture(
	channel: ChannelId,
	inputs: TvInputs,
	switchedAt: number | null,
): CanvasTexture {
	const gl = useThree((state) => state.gl);
	const invalidate = useThree((state) => state.invalidate);
	const screen = useMemo(() => {
		const canvas = document.createElement("canvas");
		canvas.width = SCREEN_W;
		canvas.height = SCREEN_H;
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		return { ctx: canvas.getContext("2d"), texture };
	}, []);
	const surface = useMemo((): PaintSurface | null => {
		const { ctx, texture } = screen;
		if (!ctx) return null;
		const painted = (): void => {
			texture.needsUpdate = true;
			invalidate();
		};
		return { pen: new Pen(ctx), painted };
	}, [screen, invalidate]);

	useEffect(() => {
		screen.texture.anisotropy = gl.capabilities.getMaxAnisotropy();
		return () => screen.texture.dispose();
	}, [gl, screen]);
	usePaintLoop(surface, channel, inputs, switchedAt);

	return screen.texture;
}
