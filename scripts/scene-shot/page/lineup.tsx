import "@fontsource/inter/600.css";
import { Canvas } from "@react-three/fiber";
import { fitOrthographic, VIEW_DIRECTION } from "@renderer/features/office/camera-fit";
import { MiiCharacter } from "@renderer/features/office/characters/MiiCharacter";
import { roomPoints } from "@renderer/features/office/OfficeCamera";
import { Lights } from "@renderer/features/office/scene/Lights";
import { STATION_SCALE } from "@renderer/features/office/scene/station";
import {
	type AvatarStyle,
	avatarStyleFor,
	browStyles,
	eyeStyles,
	glassesStyles,
	hairColors,
	hairStyles,
	hatlessHairStyles,
	headwearStyles,
	mouthStyles,
	skinTones,
} from "@shared/avatar/style";
import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import { createRoot } from "react-dom/client";
import { Vector3 } from "three";
import { settle } from "./settle";

/**
 * `lineup.html`: the voxel characters standing in a row under the office's
 * lights and camera angle, at the office overview zoom and in close-up, so
 * faces, hair and accessories can be judged without the rest of the scene.
 */

/** The scene-shot crew (see fake-office.ts). */
const CREW = ["nora", "jonas", "emma", "ava", "ben", "finn", "leo", "max"] as const;

/** One character per hairstyle, cycling every face part and accessory so each appears. */
function variant(hair: (typeof hairStyles)[number], index: number): AvatarStyle {
	const base = avatarStyleFor(`variant-${index}`);
	const style: AvatarStyle = {
		...base,
		skin: skinTones[index % skinTones.length] ?? base.skin,
		hair: { style: hair, color: hairColors[(index * 5) % hairColors.length] ?? base.hair.color },
		eyes: eyeStyles[index % eyeStyles.length] ?? base.eyes,
		brows: browStyles[(index + 1) % browStyles.length] ?? base.brows,
		mouth: mouthStyles[index % mouthStyles.length] ?? base.mouth,
	};
	delete style.glasses;
	delete style.headwear;
	if (index % 3 === 0) style.glasses = glassesStyles[(index / 3) % glassesStyles.length] ?? "round";
	if (!hatlessHairStyles.includes(hair) && index % 2 === 1) {
		const headwear = headwearStyles[((index - 1) / 2) % headwearStyles.length] ?? "cap";
		style.headwear = { style: headwear, color: base.outfit.color };
	}
	return style;
}

interface Member {
	readonly label: string;
	readonly style: AvatarStyle;
}

const crew: Member[] = CREW.map((name) => ({ label: name, style: avatarStyleFor(name) }));
const variants: Member[] = hairStyles.map((hair, index) => {
	const style = variant(hair, index);
	const extras = [style.glasses, style.headwear?.style].filter(Boolean).join(" ");
	return { label: `${hair} · ${style.eyes}/${style.mouth} ${extras}`, style };
});

/** Pixels per metre in the office overview at the scene shot's 1600×1000 viewport. */
const OVERVIEW_ZOOM = fitOrthographic(
	roomPoints(DEFAULT_LAYOUT.room),
	{ width: 1600, height: 1000 },
	0.06,
).zoom;
const CLOSE_UP_ZOOM = OVERVIEW_ZOOM * 4;

const SPACING = 0.75 * STATION_SCALE;
/** Screen-right along the floor, so the row lies across the view. */
const ACROSS = new Vector3(1, 0, -1).normalize();
/** Mid-body height: the camera aims here. */
const AIM_Y = 0.8 * STATION_SCALE;

function Row({ members }: { readonly members: Member[] }) {
	const middle = (members.length - 1) / 2;
	return (
		<>
			{members.map(({ label, style }, index) => (
				<group
					key={label}
					position={ACROSS.clone().multiplyScalar((index - middle) * SPACING)}
					rotation={[0, Math.PI / 4, 0]}
					scale={STATION_SCALE}
				>
					<MiiCharacter style={style} pose="standing" activity="idle" phase={index * 0.7} />
				</group>
			))}
		</>
	);
}

function Lineup({
	members,
	zoom,
	labels,
}: {
	readonly members: Member[];
	readonly zoom: number;
	readonly labels: boolean;
}) {
	const slot = SPACING * zoom;
	const width = Math.ceil((members.length + 0.6) * slot);
	const height = Math.ceil(1.8 * STATION_SCALE * zoom);
	const target = new Vector3(0, AIM_Y, 0);
	const position = target.clone().addScaledVector(VIEW_DIRECTION, 60);
	return (
		<div style={{ width }}>
			<div style={{ height }}>
				<Canvas
					shadows
					orthographic
					camera={{ position: position.toArray(), zoom, near: 0.1, far: 200 }}
					onCreated={({ camera }) => {
						camera.lookAt(target);
						camera.updateProjectionMatrix();
					}}
				>
					<color attach="background" args={["#f3efe7"]} />
					<Lights />
					<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
						<planeGeometry args={[40, 40]} />
						<meshStandardMaterial color={DEFAULT_LAYOUT.room.floorColor} />
					</mesh>
					<Row members={members} />
				</Canvas>
			</div>
			{labels ? (
				// Characters stand one slot apart across the view, centred, so labels line up as a row.
				<div className="labels" style={{ paddingInline: 0.3 * slot }}>
					{members.map(({ label }) => (
						<span key={label} style={{ width: slot }}>
							{label}
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}

function Page() {
	return (
		<main>
			<h2>Office overview zoom (as in m5-office.png)</h2>
			<Lineup members={crew} zoom={OVERVIEW_ZOOM} labels={false} />
			<h2>Crew close-up (4×)</h2>
			<Lineup members={crew} zoom={CLOSE_UP_ZOOM} labels />
			<h2>Every hairstyle, eye, brow, mouth, glasses and headwear (4×)</h2>
			<Lineup members={variants.slice(0, 6)} zoom={CLOSE_UP_ZOOM} labels />
			<Lineup members={variants.slice(6)} zoom={CLOSE_UP_ZOOM} labels />
		</main>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("lineup.html is missing #root");
createRoot(root).render(<Page />);
void settle();
