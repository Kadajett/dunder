import {
	BoxGeometry,
	CapsuleGeometry,
	ConeGeometry,
	CylinderGeometry,
	IcosahedronGeometry,
	SphereGeometry,
	TorusGeometry,
} from "three";

/** Head radius; the skull group squashes it to be slightly wider than tall. */
export const HEAD_R = 0.23;
export const SKULL_SCALE: [number, number, number] = [1.06, 0.94, 1];

const TAU = Math.PI * 2;
/** Half-width (radians) of the face opening left in hair shells. */
const FACE_GAP = 0.85;

/** Sphere shell open at the front (+z) so the face shows through. */
const openFrontShell = (radius: number, thetaLength: number) =>
	new SphereGeometry(radius, 14, 9, Math.PI / 2 + FACE_GAP, TAU - 2 * FACE_GAP, 0, thetaLength);

/**
 * Shared, tiny geometries for every Mii part. Created once per app and never
 * disposed, so many characters reuse the same GPU buffers.
 */
export const GEO = {
	head: new SphereGeometry(HEAD_R, 14, 12),
	ear: new SphereGeometry(0.05, 8, 6),
	eye: new SphereGeometry(0.024, 8, 6),
	pupil: new SphereGeometry(0.014, 6, 5),
	nose: new SphereGeometry(0.028, 8, 6),
	brow: new BoxGeometry(0.065, 0.016, 0.014),
	smile: new TorusGeometry(0.045, 0.011, 4, 10, Math.PI),
	grin: new CylinderGeometry(0.048, 0.048, 0.012, 12, 1, false, -Math.PI / 2, Math.PI),
	flatMouth: new BoxGeometry(0.065, 0.013, 0.012),
	openMouth: new SphereGeometry(0.032, 10, 8),
	neck: new CylinderGeometry(0.06, 0.07, 0.09, 8),
	torso: new CapsuleGeometry(0.17, 0.13, 4, 10),
	band: new CylinderGeometry(0.178, 0.178, 0.035, 10, 1, true),
	hem: new CylinderGeometry(0.18, 0.178, 0.16, 10, 1),
	coatTail: new CylinderGeometry(0.182, 0.205, 0.22, 10, 1, true, 0.35, TAU - 0.7),
	cardigan: new CylinderGeometry(0.181, 0.181, 0.3, 12, 1, true, 0.4, TAU - 0.8),
	collar: new CylinderGeometry(0.075, 0.09, 0.05, 10),
	tallCollar: new CylinderGeometry(0.085, 0.1, 0.09, 10),
	hood: new TorusGeometry(0.1, 0.05, 6, 10),
	panel: new BoxGeometry(1, 1, 1),
	disc: new CylinderGeometry(0.04, 0.04, 0.012, 10),
	button: new SphereGeometry(0.014, 6, 4),
	string: new CylinderGeometry(0.008, 0.008, 0.12, 4),
	arm: new CapsuleGeometry(0.05, 0.26, 3, 8),
	sleeve: new CylinderGeometry(0.066, 0.06, 0.13, 8),
	cuff: new CylinderGeometry(0.058, 0.058, 0.04, 8),
	hand: new SphereGeometry(0.06, 8, 6),
	thigh: new CapsuleGeometry(0.075, 0.12, 3, 8),
	shin: new CapsuleGeometry(0.066, 0.1, 3, 8),
	shoe: new BoxGeometry(0.11, 0.07, 0.19),
	hairCap: new SphereGeometry(HEAD_R * 1.06, 14, 7, 0, TAU, 0, Math.PI * 0.42),
	buzzCap: new SphereGeometry(HEAD_R * 1.015, 14, 7, 0, TAU, 0, Math.PI * 0.46),
	bobShell: openFrontShell(HEAD_R * 1.07, Math.PI * 0.7),
	longShell: openFrontShell(HEAD_R * 1.07, Math.PI * 0.76),
	baldRing: new SphereGeometry(
		HEAD_R * 1.03,
		14,
		3,
		Math.PI / 2 + FACE_GAP + 0.3,
		TAU - 2 * (FACE_GAP + 0.3),
		Math.PI * 0.4,
		Math.PI * 0.17,
	),
	spike: new ConeGeometry(0.065, 0.17, 5),
	curl: new IcosahedronGeometry(0.068, 0),
	afro: new IcosahedronGeometry(0.31, 1),
	bun: new IcosahedronGeometry(0.1, 1),
	swoop: new SphereGeometry(0.11, 10, 7),
	strand: new CapsuleGeometry(0.055, 0.2, 3, 6),
	tail: new CapsuleGeometry(0.06, 0.18, 3, 7),
	capDome: new SphereGeometry(HEAD_R * 1.1, 14, 7, 0, TAU, 0, Math.PI * 0.46),
	brim: new CylinderGeometry(0.17, 0.17, 0.02, 12, 1, false, -Math.PI / 2, Math.PI),
	beanieDome: new SphereGeometry(HEAD_R * 1.1, 14, 7, 0, TAU, 0, Math.PI / 2),
	beanieCuff: new CylinderGeometry(HEAD_R * 1.13, HEAD_R * 1.13, 0.065, 14, 1, true),
	pom: new IcosahedronGeometry(0.06, 0),
	headband: new TorusGeometry(HEAD_R * 1.12, 0.022, 4, 14, Math.PI),
	earCup: new CylinderGeometry(0.07, 0.07, 0.06, 10),
	bandana: new CylinderGeometry(HEAD_R * 1.06, HEAD_R * 1.07, 0.065, 14, 1, true),
	lensRound: new TorusGeometry(0.046, 0.009, 4, 12),
	lensSquare: new TorusGeometry(0.052, 0.009, 4, 4),
	shades: new BoxGeometry(0.09, 0.06, 0.016),
	bridge: new BoxGeometry(0.04, 0.01, 0.01),
} as const;
