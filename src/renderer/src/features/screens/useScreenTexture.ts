import type { ScreenState } from "@shared/screens";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasTexture } from "three";
import { HeadlessScreen } from "./headless-screen";
import { ScreenPainter } from "./painter";
import { createPaintScheduler } from "./scheduler";
import { createScreenClient, type ScreenClient } from "./screen-client";
import {
	createScreenStore,
	type ScreenHandle,
	type ScreenStore,
	type ScreenSurface,
} from "./screen-store";

export type ScreenTexture = CanvasTexture<OffscreenCanvas>;

export interface ScreenTextureOptions {
	/** Whether this consumer currently shows the texture (e.g. monitor in the camera frustum). */
	readonly visible: boolean;
	/** Requests a render frame after a repaint (R3F `invalidate` for `frameloop="demand"`). */
	readonly invalidate?: () => void;
}

export interface ScreenTextureResult {
	/** Null until the pane's screen exists (first effect) or when `paneId` is undefined. */
	readonly texture: ScreenTexture | null;
	readonly state: ScreenState;
}

function createPaneSurface(onDirty: () => void): ScreenSurface<ScreenTexture> {
	const screen = new HeadlessScreen(onDirty);
	const painter = new ScreenPainter();
	return {
		texture: painter.texture,
		apply: (chunk) => screen.apply(chunk),
		paint: (state) => painter.paint(screen, state),
		dispose() {
			screen.dispose();
			painter.dispose();
		},
	};
}

let windowClient: ScreenClient | undefined;
let windowStore: ScreenStore<ScreenTexture> | undefined;

/** The window's single screen client (observe ref-counting + port demux). */
export function getScreenClient(): ScreenClient {
	windowClient ??= createScreenClient(window.office.screens, `renderer-${crypto.randomUUID()}`);
	return windowClient;
}

function getScreenStore(): ScreenStore<ScreenTexture> {
	windowStore ??= createScreenStore({
		client: getScreenClient(),
		scheduler: createPaintScheduler(),
		createSurface: createPaneSurface,
	});
	return windowStore;
}

const subscribeNothing = (): (() => void) => () => {};

/**
 * Live texture of a pane's terminal, shared by every consumer of that pane. Repaints
 * happen only while some consumer reports `visible`, at most ~4 fps per pane.
 */
export function useScreenTexture(
	paneId: string | undefined,
	options: ScreenTextureOptions,
): ScreenTextureResult {
	const [handle, setHandle] = useState<ScreenHandle<ScreenTexture> | null>(null);
	useEffect(() => {
		if (paneId === undefined) return;
		const acquired = getScreenStore().acquire(paneId);
		setHandle(acquired);
		return () => {
			acquired.release();
			setHandle((current) => (current === acquired ? null : current));
		};
	}, [paneId]);

	const { visible, invalidate } = options;
	useEffect(() => handle?.update(visible, invalidate), [handle, visible, invalidate]);

	const state = useSyncExternalStore(
		handle ? handle.subscribe : subscribeNothing,
		() => handle?.getState() ?? (paneId === undefined ? "closed" : "connecting"),
	);
	return { texture: handle?.texture ?? null, state };
}
