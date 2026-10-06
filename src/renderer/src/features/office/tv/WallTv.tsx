import "./tv-fullscreen.css";
import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { PALETTE } from "../decor/palette";
import { Block } from "../decor/parts";
import { Clickable } from "../interaction/Clickable";
import { useTv } from "./tv-store";
import { useTvInputs } from "./useTvInputs";
import { useTvTexture } from "./useTvTexture";

/** Visible picture area (16:9), the bezel around it and the set's depth off the wall. */
const SCREEN_W = 2.4;
const SCREEN_H = 1.35;
const BEZEL = 0.07;
const DEPTH = 0.08;
/** A second click within this window makes a double-click (fullscreen), not two channel flips. */
const DOUBLE_CLICK_MS = 260;
/** The fullscreen badge lingers this long after the pointer leaves, so it can be reached. */
const BADGE_LINGER_MS = 700;

/** Single click flips the channel (after the double-click window); double click goes fullscreen. */
function useRemoteClick(): () => void {
	const pending = useRef<number | undefined>(undefined);
	useEffect(() => () => window.clearTimeout(pending.current), []);
	return () => {
		const { step, setFullscreen } = useTv.getState();
		if (pending.current !== undefined) {
			window.clearTimeout(pending.current);
			pending.current = undefined;
			setFullscreen(true);
			return;
		}
		pending.current = window.setTimeout(() => {
			pending.current = undefined;
			step(1);
		}, DOUBLE_CLICK_MS);
	};
}

type HoverSource = "set" | "badge";

interface LingeringHover {
	readonly visible: boolean;
	enter(source: HoverSource): void;
	leave(source: HoverSource): void;
}

/**
 * Hover over the set or its badge. Moving from one to the other reports
 * "enter badge" before "leave set", so each source is tracked on its own and
 * the badge only hides a moment after the pointer has left both.
 */
function useLingeringHover(): LingeringHover {
	const [visible, setVisible] = useState(false);
	const timer = useRef<number | undefined>(undefined);
	const active = useRef(new Set<HoverSource>());
	useEffect(() => () => window.clearTimeout(timer.current), []);
	return useMemo(
		() => ({
			visible,
			enter: (source) => {
				active.current.add(source);
				window.clearTimeout(timer.current);
				setVisible(true);
			},
			leave: (source) => {
				active.current.delete(source);
				if (active.current.size > 0) return;
				window.clearTimeout(timer.current);
				timer.current = window.setTimeout(() => setVisible(false), BADGE_LINGER_MS);
			},
		}),
		[visible],
	);
}

function FullscreenBadge({ hover }: { readonly hover: LingeringHover }) {
	const setFullscreen = useTv((state) => state.setFullscreen);
	return (
		<Html position={[0, SCREEN_H / 2 + BEZEL + 0.62, DEPTH]} center zIndexRange={[70, 60]}>
			<button
				type="button"
				className="tv-expand"
				onPointerEnter={() => hover.enter("badge")}
				onPointerLeave={() => hover.leave("badge")}
				onClick={() => setFullscreen(true)}
			>
				⤢ fullscreen
			</button>
		</Html>
	);
}

/**
 * Wall-mounted flat TV: centred on the origin, back plane at z = 0, facing +z.
 * Click to flip to the next channel, double-click (or the ⤢ badge) for fullscreen;
 * the channel survives restarts.
 */
export function WallTv() {
	const channel = useTv((state) => state.channel);
	const switchedAt = useTv((state) => state.switchedAt);
	const texture = useTvTexture(channel, useTvInputs(), switchedAt);
	const onClick = useRemoteClick();
	const hover = useLingeringHover();
	return (
		<group>
			<Clickable onSelect={onClick}>
				<group onPointerOver={() => hover.enter("set")} onPointerOut={() => hover.leave("set")}>
					<Block
						size={[SCREEN_W + BEZEL * 2, SCREEN_H + BEZEL * 2, DEPTH]}
						position={[0, 0, DEPTH / 2]}
						color="#17191d"
						roughness={0.45}
					/>
					<mesh position={[0, 0, DEPTH + 0.002]}>
						<planeGeometry args={[SCREEN_W, SCREEN_H]} />
						<meshBasicMaterial map={texture} toneMapped={false} />
					</mesh>
				</group>
			</Clickable>
			{hover.visible ? <FullscreenBadge hover={hover} /> : null}
			<Block
				size={[0.05, 0.018, 0.01]}
				position={[SCREEN_W / 2 - 0.05, -SCREEN_H / 2 - BEZEL / 2, DEPTH + 0.004]}
				color={PALETTE.ledGreen}
				emissive={PALETTE.ledGreen}
				emissiveIntensity={1.2}
				noShadow
			/>
			<Block
				size={[1.5, 0.1, 0.14]}
				position={[0, -SCREEN_H / 2 - BEZEL - 0.16, 0.07]}
				color={PALETTE.charcoal}
				roughness={0.6}
			/>
		</group>
	);
}
