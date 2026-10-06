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
	outfitPalettesFor,
	outfitStyles,
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

/** Hairstyles that can sit under any headwear, for the outfit row. */
const HAT_HAIR = ["short", "bob", "long", "ponytail", "sidePart"] as const;

/** One character per outfit, cycling hat-friendly hair and every headwear (or none). */
const outfits: Member[] = outfitStyles.map((outfit, index) => {
	const base = avatarStyleFor(`outfit-${index}`);
	const palettes = outfitPalettesFor(outfit);
	const palette = palettes[index % palettes.length] ?? base.outfit;
	const headwear = [undefined, ...headwearStyles][index % (headwearStyles.length + 1)];
	const style: AvatarStyle = {
		...base,
		skin: skinTones[(index * 3) % skinTones.length] ?? base.skin,
		hair: { ...base.hair, style: HAT_HAIR[index % HAT_HAIR.length] ?? "short" },
		outfit: { style: outfit, color: palette.color, accent: palette.accent },
	};
	delete style.headwear;
	if (headwear) style.headwear = { style: headwear, color: palette.accent };
	return { label: `${outfit} · ${headwear ?? "no hat"}`, style };
});

/** Natural colours that read apart on the floor, for the hairstyle rows. */
const HAIR_SHOW_COLORS = ["#3d2b20", "#93592c", "#c99a55", "#221c18", "#b4482c"] as const;

/** Every hairstyle bare-headed (no hat, no glasses), so silhouettes compare directly. */
const hairdos: Member[] = hairStyles.map((hair, index) => {
	const base = avatarStyleFor(`hair-${index}`);
	const color = HAIR_SHOW_COLORS[index % HAIR_SHOW_COLORS.length] ?? base.hair.color;
	const style: AvatarStyle = { ...base, hair: { style: hair, color } };
	delete style.headwear;
	delete style.glasses;
	return { label: hair, style };
});

/** One cut on six people: the per-character touches (part side, crown streak, fringe tuft). */
const sameCut: Member[] = Array.from({ length: 6 }, (_, index) => {
	const base = avatarStyleFor(`same-cut-${index}`);
	const style: AvatarStyle = { ...base, hair: { style: "short", color: "#93592c" } };
	delete style.headwear;
	delete style.glasses;
	return { label: `short #${index + 1}`, style };
});

function rows(members: readonly Member[], size: number): Member[][] {
	return Array.from({ length: Math.ceil(members.length / size) }, (_, row) =>
		members.slice(row * size, row * size + size),
	);
}

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
			<h2>Every hairstyle at office overview zoom</h2>
			<Lineup members={hairdos} zoom={OVERVIEW_ZOOM} labels={false} />
			<h2>Every hairstyle (4×)</h2>
			{rows(hairdos, 7).map((row) => (
				<Lineup key={row[0]?.label} members={row} zoom={CLOSE_UP_ZOOM} labels />
			))}
			<h2>One cut, six people: part side, crown streak and fringe tuft vary per character (4×)</h2>
			<Lineup members={sameCut} zoom={CLOSE_UP_ZOOM} labels />
			<h2>Every hairstyle, eye, brow, mouth, glasses and headwear (4×)</h2>
			{rows(variants, 7).map((row) => (
				<Lineup key={row[0]?.label} members={row} zoom={CLOSE_UP_ZOOM} labels />
			))}
			<h2>Every outfit and headwear (4×)</h2>
			<Lineup members={outfits.slice(0, 5)} zoom={CLOSE_UP_ZOOM} labels />
			<Lineup members={outfits.slice(5)} zoom={CLOSE_UP_ZOOM} labels />
		</main>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("lineup.html is missing #root");
createRoot(root).render(<Page />);
void settle();
