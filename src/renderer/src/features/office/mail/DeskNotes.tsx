import "./mail.css";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { QueuedNote } from "@shared/mail-queue";
import { useState } from "react";
import { BoxGeometry, MeshStandardMaterial } from "three";
import type { SeatedAgent } from "../model/office-model";
import { DEG, STATION_SCALE } from "../scene/station";
import { useMailQueue } from "./mail-queue-store";

/** Notes drawn one by one; any more thicken the pad underneath. */
const MAX_NOTES = 5;
/**
 * Desk-local (unscaled): the front-right corner of the desk top, in front of
 * the papers, which the camera (from +x/+z) sees past the seated agent.
 */
const SPOT = { x: 0.62, y: 0.766, z: 0.31 } as const;
/** Oversized like the rest of the station, so a note reads at overview zoom. */
const NOTE = { size: 0.18, thick: 0.012 } as const;
/** Each note lands a little askew, so a stack reads as separate sheets. */
const TWIST = [0.08, -0.14, 0.18, -0.05, 0.12] as const;
const NUDGE = [0, 0.01, -0.008, 0.012, -0.005] as const;

const NOTE_BOX = new BoxGeometry(NOTE.size, NOTE.thick, NOTE.size);
/** Light emission keeps the paper bright under the scene's tone mapping. */
const paper = (color: string): MeshStandardMaterial =>
	new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, flatShading: true });
/** Jeremy's notes are pink, agents' the classic yellow. */
const JEREMY_PAPER = paper("#ff7aa2");
const AGENT_PAPER = paper("#ffd23a");

const paperOf = (note: QueuedNote): MeshStandardMaterial =>
	note.fromJeremy ? JEREMY_PAPER : AGENT_PAPER;

/** Overlay cards never steal clicks from the 3D scene beneath them. */
const OVERLAY_STYLE = { pointerEvents: "none" } as const;

function NotesCard({ notes }: { readonly notes: readonly QueuedNote[] }) {
	const shown = notes.slice(-MAX_NOTES);
	const more = notes.length - shown.length;
	return (
		<Html position={[0, 0.32, 0]} center zIndexRange={[70, 60]} style={OVERLAY_STYLE}>
			<div className="desk-notes-card">
				<strong>
					{notes.length === 1 ? "1 message waiting" : `${notes.length} messages waiting`}
				</strong>
				{shown.map((note) => (
					<span key={note.id} data-jeremy={note.fromJeremy}>
						<b>from {note.from}:</b> {note.preview}
					</span>
				))}
				{more > 0 ? <span>+{more} more</span> : null}
			</div>
		</Html>
	);
}

/** The pile on one desk: up to five askew sheets on a pad that grows with the rest. */
function NotePile({ notes }: { readonly notes: readonly QueuedNote[] }) {
	const [hovered, setHovered] = useState(false);
	const top = notes.slice(-MAX_NOTES);
	const under = notes.length - top.length;
	const padHeight = Math.min(under, 8) * NOTE.thick;
	const oldest = notes[0];
	return (
		<group
			position={[SPOT.x, SPOT.y, SPOT.z]}
			onPointerOver={(event: ThreeEvent<PointerEvent>) => {
				event.stopPropagation();
				setHovered(true);
			}}
			onPointerOut={() => setHovered(false)}
		>
			{under > 0 && oldest ? (
				<mesh
					geometry={NOTE_BOX}
					material={paperOf(oldest)}
					position={[0, padHeight / 2, 0]}
					scale={[1, padHeight / NOTE.thick, 1]}
					castShadow
				/>
			) : null}
			{top.map((note, index) => (
				<mesh
					key={note.id}
					geometry={NOTE_BOX}
					material={paperOf(note)}
					position={[
						NUDGE[index] ?? 0,
						padHeight + NOTE.thick * (index + 0.5),
						-(NUDGE[index] ?? 0),
					]}
					rotation={[0, TWIST[index] ?? 0, 0]}
					castShadow
				/>
			))}
			{hovered ? <NotesCard notes={notes} /> : null}
		</group>
	);
}

/** Sticky notes on the desk of every seated agent with undelivered mail. */
export function DeskNotes({ seated }: { readonly seated: readonly SeatedAgent[] }) {
	const queue = useMailQueue((state) => state.queue);
	return (
		<>
			{seated.map(({ desk, agent }) => {
				const notes = queue[agent.name];
				if (!notes || notes.length === 0) return null;
				return (
					<group
						key={desk.id}
						position={[desk.position.x, 0, desk.position.z]}
						rotation={[0, desk.rotation * DEG, 0]}
						scale={STATION_SCALE}
					>
						<NotePile notes={notes} />
					</group>
				);
			})}
		</>
	);
}
