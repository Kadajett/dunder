import {
	CUE_BALL,
	POCKET_IDS,
	POCKETS,
	POOL_TABLE,
	type PocketId,
	type PoolBall,
	type PoolFrame,
} from "@shared/pool";

const R = POOL_TABLE.ballRadius;
const HALF_L = POOL_TABLE.length / 2;
const HALF_W = POOL_TABLE.width / 2;
const CORNER = POOL_TABLE.cornerJaw;
const SIDE = POOL_TABLE.sideJaw;

/** Cue-ball speed at full power, m/s (a hard break). */
export const MAX_SPEED = 7;
/** Rolling resistance of the cloth, m/s². */
export const ROLL_DECEL = 0.2;
const BALL_RESTITUTION = 0.95;
const CUSHION_RESTITUTION = 0.78;
/** Speed kept along a cushion as it grips the ball. */
const CUSHION_GRIP = 0.94;
/** A rolling ball's spin survives a hit: it ends at 5/7 of its post-impact speed plus 2/7 of its old one. */
const ROLL_KEEP = 2 / 7;
const STOP_SPEED = 0.004;
const FRAME_SECONDS = 1 / 30;
/** No step moves a ball further than this, so nothing tunnels through a ball or a jaw. */
const MAX_STEP_DISTANCE = R / 2;
const MAX_SECONDS = 60;

/** Cushion ends: balls can bounce off the corner of a pocket's opening. */
const JAWS: readonly (readonly [number, number])[] = [1, -1].flatMap((sx) =>
	[1, -1].flatMap((sy) => [
		[sx * HALF_L, sy * (HALF_W - CORNER)] as const,
		[sx * (HALF_L - CORNER), sy * HALF_W] as const,
		[sx * SIDE, sy * HALF_W] as const,
	]),
);

/** What happened during a shot, as the rules need it. */
export interface ShotEvents {
	/** The first ball the cue ball touched, or null when it touched none. */
	readonly firstContact: number | null;
	/** Balls in the order they dropped. */
	readonly pocketed: readonly { readonly id: number; readonly pocket: PocketId }[];
	/** Some ball touched a cushion after the cue ball's first contact. */
	readonly railAfterContact: boolean;
	/** Distinct object balls that touched a cushion (the break's four-ball rule). */
	readonly objectBallsToRail: number;
}

export interface Simulation {
	readonly balls: PoolBall[];
	readonly events: ShotEvents;
	/** ~30 Hz positions for the scene; empty unless asked for. */
	readonly frames: PoolFrame[];
}

class Recorder {
	firstContact: number | null = null;
	readonly pocketed: { id: number; pocket: PocketId }[] = [];
	railAfterContact = false;
	readonly railed = new Set<number>();

	rail(id: number): void {
		if (id !== CUE_BALL) this.railed.add(id);
		if (this.firstContact !== null) this.railAfterContact = true;
	}

	/** The cue ball touched `id` this step (null: nothing); only the first touch counts. */
	cueReached(id: number | null): void {
		this.firstContact ??= id;
	}
}

function nearestPocket(x: number, y: number): PocketId {
	let best: PocketId = "tl";
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const id of POCKET_IDS) {
		const distance = Math.hypot(POCKETS[id].x - x, POCKETS[id].y - y);
		if (distance < bestDistance) [best, bestDistance] = [id, distance];
	}
	return best;
}

/** One ball's mutable simulation state; only its own methods change it. */
class Body {
	readonly id: number;
	x: number;
	y: number;
	vx = 0;
	vy = 0;
	pocket: PocketId | null;

	constructor(ball: PoolBall) {
		this.id = ball.id;
		this.x = ball.x;
		this.y = ball.y;
		this.pocket = ball.pocket;
	}

	get rolling(): boolean {
		return this.pocket === null && (this.vx !== 0 || this.vy !== 0);
	}

	roll(dt: number): void {
		const speed = Math.hypot(this.vx, this.vy);
		if (speed === 0) return;
		const next = speed - ROLL_DECEL * dt;
		const scale = next < STOP_SPEED ? 0 : next / speed;
		this.vx *= scale;
		this.vy *= scale;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
	}

	/** Straight cushions: the ends between the corner jaws, the long rails between corner and side jaws. */
	cushions(events: Recorder): void {
		const ax = Math.abs(this.x);
		const ay = Math.abs(this.y);
		if (ax > HALF_L - R && ay <= HALF_W - CORNER && this.x * this.vx > 0) {
			this.vx = -this.vx * CUSHION_RESTITUTION;
			this.vy *= CUSHION_GRIP;
			this.x = Math.sign(this.x) * (HALF_L - R);
			events.rail(this.id);
		}
		if (ay > HALF_W - R && ax <= HALF_L - CORNER && ax >= SIDE && this.y * this.vy > 0) {
			this.vy = -this.vy * CUSHION_RESTITUTION;
			this.vx *= CUSHION_GRIP;
			this.y = Math.sign(this.y) * (HALF_W - R);
			events.rail(this.id);
		}
	}

	/** The cushion ends at a pocket's opening. */
	jaws(events: Recorder): void {
		for (const [jx, jy] of JAWS) {
			const dx = this.x - jx;
			const dy = this.y - jy;
			const distance = Math.hypot(dx, dy);
			if (distance >= R || distance === 0) continue;
			const nx = dx / distance;
			const ny = dy / distance;
			const approach = this.vx * nx + this.vy * ny;
			if (approach < 0) {
				this.vx -= (1 + CUSHION_RESTITUTION) * approach * nx;
				this.vy -= (1 + CUSHION_RESTITUTION) * approach * ny;
				events.rail(this.id);
			}
			this.x = jx + nx * R;
			this.y = jy + ny * R;
		}
	}

	/** A ball whose centre crosses the cushion line (only possible through an opening) drops. */
	drop(events: Recorder): void {
		if (Math.abs(this.x) <= HALF_L && Math.abs(this.y) <= HALF_W) return;
		this.pocket = nearestPocket(this.x, this.y);
		this.vx = 0;
		this.vy = 0;
		events.pocketed.push({ id: this.id, pocket: this.pocket });
	}

	/**
	 * Take this ball's share of a collision along normal (nx, ny): `impulse`
	 * (signed) changes its speed along the normal, `push` separates the overlap.
	 * A rolling ball's spin survives the hit (ROLL_KEEP).
	 */
	hit(nx: number, ny: number, impulse: number, push: number): void {
		this.vx = (1 - ROLL_KEEP) * (this.vx + impulse * nx) + ROLL_KEEP * this.vx;
		this.vy = (1 - ROLL_KEEP) * (this.vy + impulse * ny) + ROLL_KEEP * this.vy;
		this.x += nx * push;
		this.y += ny * push;
	}
}

/** Bounce two touching balls apart; returns how deep they overlapped, or -1 when they don't touch. */
function collide(a: Body, b: Body): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const distance = Math.hypot(dx, dy);
	if (distance >= 2 * R || distance === 0) return -1;
	const nx = dx / distance;
	const ny = dy / distance;
	const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
	const impulse = approach > 0 ? ((1 + BALL_RESTITUTION) / 2) * approach : 0;
	const push = (2 * R - distance) / 2;
	a.hit(nx, ny, -impulse, -push);
	b.hit(nx, ny, impulse, push);
	return 2 * R - distance;
}

/** Resolve contacts; the cue ball's deepest overlap in its first contact step is the ball it reached first. */
function collisions(bodies: readonly Body[], events: Recorder): void {
	for (let i = 0; i < bodies.length; i += 1) {
		const a = bodies[i] as Body;
		if (a.pocket !== null) continue;
		let deepest = -1;
		let reached: number | null = null;
		for (let j = i + 1; j < bodies.length; j += 1) {
			const b = bodies[j] as Body;
			const depth = b.pocket === null ? collide(a, b) : -1;
			if (depth > deepest) [deepest, reached] = [depth, b.id];
		}
		if (a.id === CUE_BALL) events.cueReached(reached);
	}
}

function step(bodies: readonly Body[], dt: number, events: Recorder): void {
	for (const body of bodies) if (body.pocket === null) body.roll(dt);
	for (const body of bodies) {
		if (!body.rolling) continue;
		body.cushions(events);
		body.jaws(events);
		body.drop(events);
	}
	collisions(bodies, events);
}

function frameOf(bodies: readonly Body[], shot: number, t: number): PoolFrame {
	const round = (value: number): number => Math.round(value * 10_000) / 10_000;
	return {
		shot,
		t: round(t),
		balls: bodies.flatMap((b) =>
			b.pocket === null ? [[b.id, round(b.x), round(b.y)] as const] : [],
		),
	};
}

/**
 * Roll a shot to rest with fixed sub-steps (a whole number per 1/30 s frame,
 * sized to the fastest ball), so the same table and strike always give the same result.
 */
export function simulate(
	balls: readonly PoolBall[],
	strike: { readonly angle: number; readonly speed: number },
	record?: { readonly shot: number },
): Simulation {
	const bodies: Body[] = [...balls].sort((a, b) => a.id - b.id).map((ball) => new Body(ball));
	const cue = bodies.find((body) => body.id === CUE_BALL);
	if (cue && cue.pocket === null) {
		const radians = (strike.angle * Math.PI) / 180;
		cue.vx = strike.speed * Math.cos(radians);
		cue.vy = strike.speed * Math.sin(radians);
	}
	const events = new Recorder();
	const frames: PoolFrame[] = record ? [frameOf(bodies, record.shot, 0)] : [];
	for (let frame = 1; frame * FRAME_SECONDS <= MAX_SECONDS; frame += 1) {
		const fastest = Math.max(...bodies.map((b) => Math.hypot(b.vx, b.vy)));
		if (fastest === 0) break;
		const steps = Math.max(1, Math.ceil((fastest * FRAME_SECONDS) / MAX_STEP_DISTANCE));
		for (let i = 0; i < steps; i += 1) step(bodies, FRAME_SECONDS / steps, events);
		if (record) frames.push(frameOf(bodies, record.shot, frame * FRAME_SECONDS));
	}
	return {
		balls: bodies.map(({ id, x, y, pocket }) => ({ id, x, y, pocket })),
		events: {
			firstContact: events.firstContact,
			pocketed: events.pocketed,
			railAfterContact: events.railAfterContact,
			objectBallsToRail: events.railed.size,
		},
		frames,
	};
}
