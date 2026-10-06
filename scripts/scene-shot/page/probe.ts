import { addAfterEffect, addEffect, type RootState } from "@react-three/fiber";
import { type GlCallCounts, glCallCounts, glCallsPerFrame, instrumentGl } from "./gl-calls";
import {
	dynamicTargets,
	type MeshCounts,
	rootState,
	type ScreenPoint,
	sceneStats,
	screenTextures,
} from "./scene-inspect";

interface Stats {
	readonly p50: number;
	readonly p95: number;
	readonly max: number;
}

export interface ProbeReport {
	readonly frames: number;
	readonly fps: number;
	/** Wall-clock gap between consecutive animation frames. */
	readonly frameMs: Stats;
	/** CPU time of the R3F frame: every useFrame callback plus the three.js render submission. */
	readonly loopMs: Stats;
	/** Long-task time (>50 ms) observed during the window. */
	readonly longTaskMs: number;
	readonly info: {
		readonly calls: number;
		readonly triangles: number;
		readonly geometries: number;
		readonly textures: number;
		readonly programs: number;
	} | null;
	readonly shadowMap: { readonly type: number; readonly autoUpdate: boolean } | null;
	readonly renderer: string | null;
	readonly dpr: number;
	readonly drawingBuffer: readonly [number, number] | null;
	/** WebGL calls per frame (averaged over the window), by method. */
	readonly glCallsPerFrame: GlCallCounts;
}

interface FrameSample {
	readonly frameMs: number;
	readonly loopMs: number;
}

declare global {
	interface Window {
		__probe: {
			measure(durationMs: number): Promise<ProbeReport>;
			sceneStats(): Record<string, MeshCounts>;
			dynamicTargets(): ScreenPoint[];
			screenTextures(): Promise<string[]>;
			/** The R3F root state (scene, camera, gl) for ad-hoc inspection from the console. */
			rootState(): RootState | undefined;
		};
	}
}

const round = (value: number): number => Math.round(value * 100) / 100;

function stats(values: readonly number[]): Stats {
	const sorted = [...values].sort((a, b) => a - b);
	const at = (q: number): number =>
		sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
	return { p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1) ?? 0) };
}

function report(
	samples: readonly FrameSample[],
	elapsed: number,
	longTaskMs: number,
	glBefore: GlCallCounts,
): ProbeReport {
	const gl = rootState()?.gl;
	const context = gl?.getContext();
	const debug = context?.getExtension("WEBGL_debug_renderer_info");
	return {
		frames: samples.length,
		fps: round((samples.length / elapsed) * 1000),
		frameMs: stats(samples.map((sample) => sample.frameMs)),
		loopMs: stats(samples.map((sample) => sample.loopMs)),
		longTaskMs: round(longTaskMs),
		info: gl
			? {
					calls: gl.info.render.calls,
					triangles: gl.info.render.triangles,
					geometries: gl.info.memory.geometries,
					textures: gl.info.memory.textures,
					programs: gl.info.programs?.length ?? 0,
				}
			: null,
		shadowMap: gl ? { type: gl.shadowMap.type, autoUpdate: gl.shadowMap.autoUpdate } : null,
		renderer: context && debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
		dpr: gl?.getPixelRatio() ?? window.devicePixelRatio,
		drawingBuffer: context ? [context.drawingBufferWidth, context.drawingBufferHeight] : null,
		glCallsPerFrame: glCallsPerFrame(glBefore, glCallCounts(), samples.length),
	};
}

/** Samples animation frames for `durationMs`; `loopMsOf` yields and resets the R3F loop time accumulated since the last frame. */
function measure(durationMs: number, loopMsOf: () => number): Promise<ProbeReport> {
	const { promise, resolve } = Promise.withResolvers<ProbeReport>();
	const samples: FrameSample[] = [];
	let longTaskMs = 0;
	const observer = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) longTaskMs += entry.duration;
	});
	observer.observe({ type: "longtask" });
	const glBefore = glCallCounts();
	const started = performance.now();
	let last = started;
	const onFrame = (): void => {
		const now = performance.now();
		samples.push({ frameMs: now - last, loopMs: loopMsOf() });
		last = now;
		if (now - started < durationMs) {
			requestAnimationFrame(onFrame);
			return;
		}
		observer.disconnect();
		resolve(report(samples, now - started, longTaskMs, glBefore));
	};
	loopMsOf();
	requestAnimationFrame(onFrame);
	return promise;
}

/** Times every R3F frame (addEffect → addAfterEffect), counts GL calls and exposes `window.__probe`. */
export function installFrameProbe(): void {
	instrumentGl();
	let loopStart = 0;
	let loopMs = 0;
	addEffect(() => {
		loopStart = performance.now();
	});
	addAfterEffect(() => {
		loopMs += performance.now() - loopStart;
	});
	const takeLoopMs = (): number => {
		const value = loopMs;
		loopMs = 0;
		return value;
	};
	window.__probe = {
		measure: (durationMs) => measure(durationMs, takeLoopMs),
		sceneStats,
		dynamicTargets,
		screenTextures,
		rootState,
	};
}
