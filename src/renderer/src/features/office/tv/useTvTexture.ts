import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { badgeVisible, type ChannelId } from "./channels";
import { Pen, SCREEN_H, SCREEN_W } from "./paint/kit";
import { frameKey, paintFrame, type TvInputs } from "./screen";

/** Fastest the screen repaints (≈4 fps); frames that look unchanged are skipped. */
const TICK_MS = 250;

/** Canvas fonts must be loaded before the first paint or text falls back to a system face. */
const FONT_FACES = [
	'400 32px "Inter"',
	'600 32px "Inter"',
	'700 32px "Inter"',
	'400 32px "JetBrains Mono"',
	'700 32px "JetBrains Mono"',
];

function useFontsReady(): boolean {
	const [ready, setReady] = useState(false);
	useEffect(() => {
		let live = true;
		void Promise.allSettled(FONT_FACES.map((face) => document.fonts.load(face))).then(() => {
			if (live) setReady(true);
		});
		return () => {
			live = false;
		};
	}, []);
	return ready;
}

/** The TV's screen texture, repainted from `channel` + `inputs` whenever the picture changes. */
export function useTvTexture(
	channel: ChannelId,
	inputs: TvInputs,
	switchedAt: number | null,
): CanvasTexture {
	const gl = useThree((state) => state.gl);
	const invalidate = useThree((state) => state.invalidate);
	const fontsReady = useFontsReady();
	const screen = useMemo(() => {
		const canvas = document.createElement("canvas");
		canvas.width = SCREEN_W;
		canvas.height = SCREEN_H;
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		const ctx = canvas.getContext("2d");
		return { pen: ctx ? new Pen(ctx) : null, texture, lastKey: { value: "" } };
	}, []);

	useEffect(() => {
		screen.texture.anisotropy = gl.capabilities.getMaxAnisotropy();
		return () => screen.texture.dispose();
	}, [gl, screen]);

	useEffect(() => {
		const { pen, texture, lastKey } = screen;
		if (!pen) return;
		const tick = (): void => {
			const now = Date.now();
			const frame = { channel, inputs, now, showBadge: badgeVisible(switchedAt, now) };
			const key = `${fontsReady}|${frameKey(frame)}`;
			if (key === lastKey.value) return;
			lastKey.value = key;
			paintFrame(pen, frame);
			texture.needsUpdate = true;
			invalidate();
		};
		tick();
		const timer = setInterval(tick, TICK_MS);
		return () => clearInterval(timer);
	}, [screen, channel, inputs, switchedAt, fontsReady, invalidate]);

	return screen.texture;
}
