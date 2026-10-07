// biome-ignore-all lint/style/noExcessiveLinesPerFile: stub data for every HUD surface; splitting it scatters one fixture.
import type { AppError } from "@shared/app-errors";
import { UPDATE_FREE_MS, type UpdateStatus } from "@shared/app-update";
import { avatarStyleFor } from "@shared/avatar/style";
import type { AwaySummary } from "@shared/away";
import type { ChiefMessage } from "@shared/chief";
import { firstCompany, summarize } from "@shared/company/company-ops";
import type { Roster } from "@shared/company/roster";
import { type AgentStatus, sessionSnapshotSchema } from "@shared/herdr/schema";
import type { Snooze } from "@shared/inbox-snooze";
import { type MailQueue, previewOf } from "@shared/mail-queue";
import type { AgentModel, ModelOption } from "@shared/models";
import type { CostToday } from "@shared/office-stats";
import type { PoolBall, PoolView } from "@shared/pool";
import type { OfficeMessage } from "@shared/switchboard";
import type { WhatsNew } from "@shared/whats-new";
import type { HumanAsk, WorkBoard, WorkCard } from "@shared/work-board";
import { fakeWhiteboard } from "./fake-board";

/**
 * HUD screenshot harness: a full stand-in for the preload's `window.office`, with every API
 * the HUD reads present and realistic.
 * `window.__fake` lets the harness page push state through the same listeners
 * main would use.
 */

// One Chrome profile serves every state: renderer stores read localStorage at import, after this module.
localStorage.clear();

/**
 * Fresh launch (after an update and 3 h away): the What's new and Away cards are due. Every other
 * state is the steady office, those cards long dismissed, so each surface can be judged on its own.
 */
const FRESH_LAUNCH = [
	"01-default",
	"01b-away",
	"01c-whats-new",
	"09b-pool-table-fresh",
	"11-everything",
];
const freshLaunch = FRESH_LAUNCH.includes(
	new URLSearchParams(location.search).get("state") ?? "01-default",
);

/** The fixed clock hud.html installs before any module loads (2026-10-07 09:41 local). */
export const NOW = Date.now();
const MIN = 60_000;
const ago = (minutes: number) => new Date(NOW - minutes * MIN).toISOString();

// ---- push channels -------------------------------------------------------------------------

type Listener = (value: unknown) => void;
const channels = new Map<string, Set<Listener>>();
function on(name: string) {
	return (listener: Listener) => {
		let set = channels.get(name);
		if (!set) {
			set = new Set();
			channels.set(name, set);
		}
		set.add(listener);
		return () => void set.delete(listener);
	};
}
export function emit(name: string, value: unknown): void {
	for (const listener of channels.get(name) ?? []) listener(value);
}
const unsubscribe = (): void => undefined;

// ---- the crew ------------------------------------------------------------------------------

interface Crew {
	readonly name: string;
	readonly status: AgentStatus;
	readonly role: string;
	readonly activity: string;
}

const ROOMS: Record<string, readonly Crew[]> = {
	hq: [
		{
			name: "max",
			status: "working",
			role: "chief-of-staff",
			activity: "Planning the Q4 launch board",
		},
	],
	delivery: [
		{
			name: "theo",
			status: "working",
			role: "frontend",
			activity: "Grouping repeat app errors in the Trust Inbox",
		},
		{
			name: "carl",
			status: "working",
			role: "backend",
			activity: "Pool engine: called-pocket rules",
		},
		{
			name: "mika",
			status: "done",
			role: "product-engineer",
			activity: "What's new: thumbs-down feedback shipped",
		},
		{
			name: "otto",
			status: "blocked",
			role: "ops",
			activity: "Waiting: OK to drop Node 20 so rollback can share node_modules?",
		},
	],
	sales: [
		{
			name: "sam",
			status: "done",
			role: "generalist",
			activity: "Chief dock renders markdown tables",
		},
		{
			name: "raina",
			status: "working",
			role: "product-manager",
			activity: "Hire dialog: harness check before the look",
		},
	],
};

const snapshot = sessionSnapshotSchema.parse({
	version: "hud-shot",
	protocol: 0,
	workspaces: Object.entries(ROOMS).map(([label, crew], index) => ({
		workspace_id: `w${index + 1}`,
		label,
		number: index + 1,
		focused: false,
		agent_status: "working",
		pane_count: crew.length,
		tab_count: 1,
	})),
	tabs: [],
	panes: [],
	agents: Object.values(ROOMS).flatMap((crew, ws) =>
		crew.map((agent, index) => ({
			pane_id: `w${ws + 1}:p${index + 1}`,
			tab_id: `w${ws + 1}:t1`,
			workspace_id: `w${ws + 1}`,
			terminal_id: `t${ws + 1}-${index + 1}`,
			focused: false,
			agent_status: agent.status,
			agent: "omp",
			name: agent.name,
			cwd: "/home/jeremy/dev/dunder",
			terminal_title_stripped: `π > ${agent.activity}`,
			state_change_seq: 40 + ws * 10 + index,
		})),
	),
});

const allCrew = Object.entries(ROOMS).flatMap(([room, crew]) =>
	crew.map((agent) => ({ ...agent, room })),
);

const roster: Roster = {
	version: 1,
	agents: allCrew.map((agent, index) => ({
		id: `agent-${agent.name}`,
		name: agent.name,
		style: avatarStyleFor(agent.name),
		role: agent.role,
		harness: "omp",
		model: index % 3 === 0 ? "anthropic/claude-opus-5-5" : "anthropic/claude-sonnet-5",
		workspaceLabel: agent.room,
		cwd: "/home/jeremy/dev/dunder",
		createdAt: ago(60 * 24 * (10 - index)),
	})),
};

// ---- work board ----------------------------------------------------------------------------

function card(
	id: string,
	title: string,
	[lane, assignee]: readonly [WorkCard["lane"], string | null],
	extra: Partial<WorkCard> = {},
): WorkCard {
	return {
		id,
		title,
		lane,
		assignee,
		priority: 2,
		epic: null,
		waitingOn: [],
		description: "",
		acceptance: "",
		updatedAt: ago(30),
		startedAt: null,
		spend: null,
		epicSpend: null,
		...extra,
	};
}

const cards: WorkCard[] = [
	card("office-k2p.3", "Trust Inbox: group repeat app errors by region", ["in_progress", "theo"], {
		priority: 1,
		epic: "Trust Inbox v2",
		spend: 412,
		epicSpend: { usd: 18.6, beads: 5 },
		updatedAt: ago(4),
		description:
			"The same boundary error shows once per render today. Group errors by region + message and show a count, newest first.",
		acceptance:
			"Three identical errors show as one card with ×3.\nDismiss clears the group.\nNo change for single errors.",
	}),
	card("office-m7q", "Pool table: show the called pocket on the cloth", ["in_progress", "carl"], {
		epic: "Pool night",
		spend: 188,
		epicSpend: { usd: 9.1, beads: 4 },
		updatedAt: ago(9),
	}),
	card(
		"office-r4d.2",
		"Hire dialog: run the harness check before the look picker",
		["in_progress", "raina"],
		{
			epic: "Hiring",
			spend: 96,
			updatedAt: ago(14),
		},
	),
	card("office-b8n", "Call dock: barge-in stops Max mid-sentence", ["review", "mika"], {
		priority: 1,
		epic: "Calls with Max",
		spend: 233,
		updatedAt: ago(22),
	}),
	card("office-t3c", "Work bar: drag cards between lanes", ["review", "theo"], {
		spend: 151,
		updatedAt: ago(48),
	}),
	card("office-w9e", "Stable updates: roll back across a dependency change", ["blocked", "otto"], {
		priority: 1,
		waitingOn: ["office-w9e.1"],
		updatedAt: ago(35),
	}),
	card("office-h5j", "Whiteboard: export the board as PNG for the deck", ["blocked", "sam"], {
		priority: 3,
		waitingOn: ["office-a1x"],
		updatedAt: ago(70),
	}),
	card("office-c6v", "Away card: link closed beads to their PRs", ["ready", null], {
		updatedAt: ago(90),
	}),
	card("office-p0s", "Brain panel: search across every project's memories", ["ready", null], {
		updatedAt: ago(120),
	}),
	card("office-y2k", "Clients panel: show each room's open beads", ["ready", "raina"], {
		priority: 3,
		updatedAt: ago(200),
	}),
	card("office-g4f", "TV: rotate between weather and the build feed", ["ready", null], {
		priority: 4,
		updatedAt: ago(400),
	}),
	card("office-q1a", "What's new: thumbs down asks what's off", ["done", "mika"], {
		spend: 164,
		updatedAt: ago(18),
	}),
	card("office-u8e", "Chief dock: render markdown tables in replies", ["done", "sam"], {
		spend: 92,
		updatedAt: ago(41),
	}),
	card("office-e3r", "Snooze asks until the morning", ["done", "theo"], {
		spend: 120,
		updatedAt: ago(180),
	}),
];

const asks: HumanAsk[] = [
	{
		id: "office-w9e.1",
		question: "OK to drop Node 20 support so a rollback can share node_modules?",
		detail:
			"Rolling back across a lockfile change needs its own node_modules. Dropping Node 20 lets both builds share one install. Node 22 is already what the app ships with.",
		asker: "otto",
		blocks: [{ id: "office-w9e", title: "Stable updates: roll back across a dependency change" }],
		createdAt: ago(35),
	},
	{
		id: "office-a1x",
		question: "Can I spend $40 on a stock photo pack for the Nuvora pitch deck?",
		detail:
			"Unsplash doesn't have office shots that match the deck's style; the pack is royalty-free.",
		asker: "sam",
		blocks: [{ id: "office-h5j", title: "Whiteboard: export the board as PNG for the deck" }],
		createdAt: ago(70),
	},
	{
		id: "office-n3m",
		question: "Which client gets the Thursday demo slot: Nuvora or the fintech CTO?",
		detail: "",
		asker: "raina",
		blocks: [],
		createdAt: ago(150),
	},
];

const board: WorkBoard = { state: "ok", revision: 7, cards, asks };

// ---- notices -------------------------------------------------------------------------------

const errors: AppError[] = [
	{
		id: "err-1",
		message: "Cannot read properties of undefined (reading 'seat')",
		stack:
			"TypeError: Cannot read properties of undefined (reading 'seat')\n    at WorldCards (WorldCards.tsx:41:22)",
		where: "boundary:agent cards",
		count: 3,
		firstAt: NOW - 25 * MIN,
		lastAt: NOW - 6 * MIN,
	},
	{
		id: "err-2",
		message: "THREE.WebGLRenderer: Context Lost.",
		stack: undefined,
		where: "console",
		count: 1,
		firstAt: NOW - 50 * MIN,
		lastAt: NOW - 50 * MIN,
	},
	{
		id: "err-3",
		message: "Failed to fetch the weather: 503 Service Unavailable",
		stack: undefined,
		where: "promise",
		count: 12,
		firstAt: NOW - 180 * MIN,
		lastAt: NOW - 2 * MIN,
	},
];

const whatsNew: WhatsNew = {
	built: "13e07812c9f0d5a4b1e6",
	recent: false,
	beads: [
		{
			id: "office-q1a",
			title: "What's new: thumbs down asks what's off",
			subject: "whats-new: ask what's off on a thumbs down (office-q1a)",
			tryIt: "Thumb a row down on this card",
			rating: null,
			type: "task",
			internal: false,
		},
		{
			id: "office-u8e",
			title: "Chief dock: render markdown tables in replies",
			subject: "chief: markdown tables (office-u8e)",
			tryIt: "Ask Max for a spend table",
			rating: "up",
			type: "feature",
			internal: false,
		},
		{
			id: "office-e3r",
			title: "Snooze asks until the morning",
			subject: "inbox: snooze until 9:00 (office-e3r)",
			tryIt: null,
			rating: null,
			type: "feature",
			internal: false,
		},
		{
			id: "office-7hk",
			title: "Away card: what happened while you were gone",
			subject: "away: summary card (office-7hk)",
			tryIt: "Lock the screen for 2 h",
			rating: null,
			type: "feature",
			internal: false,
		},
		{
			id: "office-f2d",
			title: null,
			subject: "pool: autopilot plays Jeremy's shot after 20 s (office-f2d)",
			tryIt: null,
			rating: "down",
			type: "bug",
			internal: false,
		},
		{
			id: "office-j8s",
			title: "Mic popover: test your mic before a call",
			subject: "call: mic check (office-j8s)",
			tryIt: "Start a call, then Mic",
			rating: null,
			type: "bug",
			internal: false,
		},
		{
			id: "office-k2p",
			title: "hud:shot captures every HUD state",
			subject: "office-k2p: hud-shot harness",
			tryIt: null,
			rating: null,
			type: "task",
			internal: true,
		},
	],
	others: ["Bump three to r180", "Fix flaky pool test"],
	ratingOff: null,
};

const awaySummary: AwaySummary = {
	awayAt: NOW - 190 * MIN,
	backAt: NOW - MIN,
	closed: [
		{ id: "office-q1a", title: "What's new: thumbs down asks what's off" },
		{ id: "office-u8e", title: "Chief dock: render markdown tables in replies" },
		{ id: "office-e3r", title: "Snooze asks until the morning" },
		{ id: "office-7hk", title: "Away card: what happened while you were gone" },
	],
	asks: 2,
	updates: 3,
	spendUsd: 23.4,
};

const commits = [
	{ sha: "a91f3c0d2e", subject: "inbox: group repeat app errors (office-k2p.3)" },
	{ sha: "77b2e1a9c4", subject: "work: drag cards between lanes (office-t3c)" },
	{ sha: "3c0e9f12ab", subject: "call: barge-in stops Max mid-sentence (office-b8n)" },
];

let updateStatus: UpdateStatus = {
	state: "available",
	head: "a91f3c0d2e",
	commits,
	behind: 3,
	held: {
		by: "theo",
		reason: "ship the Trust Inbox error grouping",
		extra: 1,
		busy: null,
		startsAt: NOW + UPDATE_FREE_MS,
	},
};

export function setUpdateStatus(status: UpdateStatus): void {
	updateStatus = status;
	emit("update", status);
}

/**
 * Main turns a held update into a countdown 10 s after Jeremy is free; the fake doesn't, so a
 * long settle would leave 'countdown in 0 s'. Restart that wait right before a shot.
 */
export function refreshHeld(): void {
	if (updateStatus.state !== "available" || !updateStatus.held || updateStatus.held.busy !== null)
		return;
	setUpdateStatus({
		...updateStatus,
		held: { ...updateStatus.held, startsAt: Date.now() + UPDATE_FREE_MS },
	});
}

const snoozes: Snooze[] = [{ key: "ask:office-n3m", until: NOW + 3 * 60 * MIN }];

// ---- chief, models, cost -------------------------------------------------------------------

const chiefHistory: ChiefMessage[] = [
	{
		id: "c1",
		author: "you",
		text: "Morning Max. What's blocking delivery?",
		at: NOW - 40 * MIN,
		state: "sent",
	},
	{
		id: "c2",
		author: "chief",
		text: "Two things:\n\n- **otto** is waiting on you: OK to drop Node 20 (office-w9e.1)?\n- **sam** needs a yes on a $40 photo pack (office-a1x).\n\ntheo is spending fast on office-k2p.3; I'm watching it.",
		at: NOW - 39 * MIN,
	},
	{
		id: "c3",
		author: "you",
		text: "Yes to the photos. Give me a minute on Node.",
		at: NOW - 3 * MIN,
		state: "sent",
		call: true,
	},
	{
		id: "c4",
		author: "chief",
		text: "Done, I told sam. otto stays blocked until you answer.",
		spoken: "Done, I told Sam. Otto stays blocked until you answer.",
		at: NOW - 2 * MIN,
	},
];

const catalog: ModelOption[] = [
	{
		selector: "anthropic/claude-opus-5-5",
		name: "Claude Opus 5.5",
		provider: "anthropic",
		thinking: ["low", "medium", "high"],
		contextWindow: 400_000,
	},
	{
		selector: "anthropic/claude-sonnet-5",
		name: "Claude Sonnet 5",
		provider: "anthropic",
		thinking: ["low", "medium", "high"],
		contextWindow: 400_000,
	},
	{
		selector: "openai/gpt-5.2-codex",
		name: "GPT-5.2 Codex",
		provider: "openai",
		thinking: ["low", "high"],
		contextWindow: 272_000,
	},
];

const liveModels: Record<string, AgentModel> = Object.fromEntries(
	roster.agents.map((agent) => [agent.name, { model: agent.model, thinking: "high" }]),
);

const cost: CostToday = {
	state: "ok",
	day: new Date(NOW).toISOString().slice(0, 10),
	usd: 61.42,
	sessions: 14,
	agents: [
		{ name: "theo", usd: 19.8, recentUsd: 7.42 },
		{ name: "max", usd: 12.1, recentUsd: 1.2 },
		{ name: "carl", usd: 9.6, recentUsd: 2.3 },
		{ name: "mika", usd: 8.2, recentUsd: 0.4 },
		{ name: "raina", usd: 6.1, recentUsd: 1.9 },
		{ name: "sam", usd: 3.9, recentUsd: 0 },
		{ name: "otto", usd: 1.7, recentUsd: 0 },
	],
	untracked: [],
};

const replies: Record<string, string> = {
	mika: "Shipped office-q1a: a thumbs down on a What's new row now opens a one-line 'what's off?' box.\nThe text goes on the bead as a comment so the author sees it.\nTests: whats-new-store (4 new), all green.\nMerged to master as 3c0e9f1; Max has the review note.",
	sam: "Chief dock renders markdown tables now (office-u8e).\nWide tables scroll sideways inside the bubble instead of stretching the dock.",
};

const mailQueue: MailQueue = {
	theo: [
		{
			id: "theo-max-0",
			from: "max",
			fromJeremy: false,
			preview: previewOf("Slow down on k2p.3: you're at $7 in 30 min"),
			at: NOW - 5 * MIN,
		},
	],
	max: [
		{
			id: "max-jeremy-0",
			from: "jeremy",
			fromJeremy: true,
			preview: previewOf("After the call: Thursday demo slot"),
			at: NOW - MIN,
		},
	],
};

const switchboard: OfficeMessage[] = [
	{
		id: "theo-max-0",
		from: "max",
		to: "theo",
		text: "Slow down on k2p.3: you're at $7 in 30 min",
		sentAt: ago(5),
		state: "queued",
	},
];

// ---- pool ----------------------------------------------------------------------------------

const RESTING: PoolView = {
	stage: "resting",
	mode: null,
	balls: [],
	sides: [],
	turn: null,
	shooter: null,
	ballInHand: null,
	onEight: false,
	moving: false,
	shot: 0,
	queue: [],
	last: null,
	recent: [],
	result: null,
	jeremy: { joined: false, viewing: false, yourTurn: false, autopilotAt: null },
	label: "",
};

const spots: ReadonlyArray<readonly [number, number, number]> = [
	[0, -0.55, 0.05],
	[1, 0.4, 0.2],
	[3, 0.62, -0.1],
	[5, 0.7, 0.3],
	[6, -0.2, -0.35],
	[8, 0.56, 0],
	[10, 0.3, -0.3],
	[11, 0.85, -0.25],
	[13, -0.4, 0.38],
	[15, 0.1, 0.15],
];

const POOL_BALLS: PoolBall[] = Array.from({ length: 16 }, (_, id) => {
	const spot = spots.find(([ball]) => ball === id);
	return spot
		? { id, x: spot[1], y: spot[2], pocket: null }
		: { id, x: 0, y: 0, pocket: id % 2 ? "tr" : "bl" };
});

export const POOL_PLAYING: PoolView = {
	stage: "playing",
	mode: "game",
	balls: POOL_BALLS,
	sides: [
		{ players: ["Jeremy"], group: "solids", left: [1, 3, 5, 6] },
		{ players: ["carl"], group: "stripes", left: [10, 11, 13, 15] },
	],
	turn: 0,
	shooter: "Jeremy",
	ballInHand: null,
	onEight: false,
	moving: false,
	shot: 9,
	queue: ["theo", "raina"],
	last: { by: "carl", text: "carl: potted 12, 9 · missed the 13 · your shot" },
	recent: [
		{ by: "Jeremy", text: "Jeremy: potted 2 · missed the 4" },
		{ by: "carl", text: "carl: potted 12, 9 · missed the 13 · your shot" },
	],
	result: null,
	jeremy: { joined: true, viewing: true, yourTurn: true, autopilotAt: null },
	label: "Jeremy vs carl",
};

let pool: PoolView = RESTING;
export function setPool(view: PoolView): void {
	pool = view;
	emit("pool", view);
}

// ---- the API -------------------------------------------------------------------------------

/** Crash/error reports the app sent (ErrorBoundary hits etc.), for the audit report. */
export const reports: unknown[] = [];

/** `window.office` members the app read that this stub lacks, for the audit report. */
export const unstubbed: string[] = [];

const company = firstCompany(new Date(NOW));
const otherCompany = { id: "nuvora", name: "Nuvora", subtitle: "client pilot" };

/** Unknown members: `onX` subscribes (no-op), anything else resolves undefined. */
function tolerant<T extends object>(target: T, path: string): T {
	return new Proxy(target, {
		get(object, key, receiver) {
			if (typeof key === "symbol" || key in object) return Reflect.get(object, key, receiver);
			if (key === "then") return undefined;
			if (!unstubbed.includes(`${path}.${key}`)) unstubbed.push(`${path}.${key}`);
			return key.startsWith("on") ? () => unsubscribe : async () => undefined;
		},
	});
}

const api = {
	getSnapshot: async () => snapshot,
	getStatus: async () => ({ state: "connected" }),
	onSnapshot: on("snapshot"),
	onEvent: () => unsubscribe,
	onStatus: () => unsubscribe,
	getWeather: async () => ({ report: null, error: null }),
	onWeather: () => unsubscribe,
	screens: {
		observe: () => undefined,
		unobserve: () => undefined,
		open: async () => "hud-shot",
		send: () => undefined,
		close: () => undefined,
		onMessage: () => unsubscribe,
	},
	calisthenics: {
		onWorkout: () => unsubscribe,
		active: async () => [],
		startNow: async () => undefined,
	},
	switchboard: { recent: async () => switchboard, onMessage: () => unsubscribe },
	mailQueue: { get: async () => mailQueue, onChange: () => unsubscribe },
	roster: { get: async () => roster, onChange: () => unsubscribe },
	models: {
		catalog: async () => catalog,
		live: async () => liveModels,
		onLive: () => unsubscribe,
		setModel: async () => ({ state: "applied" }),
	},
	chief: {
		status: async () => ({
			name: "max",
			role: "chief-of-staff",
			status: "working",
			model: "anthropic/claude-opus-5-5",
			style: avatarStyleFor("max"),
		}),
		history: async () => chiefHistory,
		onMessage: () => unsubscribe,
		send: async () => ({ state: "sent" }),
	},
	stats: {
		costToday: async () => cost,
		onCostToday: () => unsubscribe,
		memories: async () => ({
			projects: [
				{
					state: "ok",
					cwd: "/home/jeremy/dev/dunder",
					name: "dunder",
					memories: [
						{
							key: "stable-mode",
							text: "Jeremy's app runs a production build; agents ask with office-update, never restart it.",
						},
						{ key: "beads-only", text: "bd is the only source of truth for work; no TODO files." },
						{
							key: "worktrees",
							text: "Every bead gets its own worktree at ~/dev/worktrees/<agent>-<bead> on bead/<bead>.",
						},
						{
							key: "voice",
							text: "ElevenLabs key lives in ~/.config/friday-personal/secrets.env.",
						},
					],
				},
				{
					state: "ok",
					cwd: "/home/jeremy/dev/nuvora-site",
					name: "nuvora-site",
					memories: [
						{ key: "brand", text: "Nuvora's brand blue is #1f4fbf; never use pure black text." },
						{ key: "deploy", text: "Deploys go through Vercel previews; Jeremy approves prod." },
					],
				},
				{
					state: "unavailable",
					cwd: "/home/jeremy/dev/pitch-deck",
					name: "pitch-deck",
					reason: "bd not initialised here",
				},
			],
		}),
		remember: async () => ({ ok: true }),
		forget: async () => ({ ok: true }),
		seenDone: async () => ({}),
		markSeen: async () => undefined,
	},
	companies: {
		list: async () => [summarize(company), otherCompany],
		current: async () => company,
		onCurrent: () => unsubscribe,
		switchTo: async () => undefined,
		create: async () => company,
		updateSettings: async () => undefined,
		saveLayout: async () => undefined,
		ensureWorkspace: async () => ({ workspaceId: "w1" }),
	},
	workforce: {
		defaults: async () => ({ cwd: "/home/jeremy/dev/dunder" }),
		checkHarness: async () => ({ state: "ready" }),
		hire: async () => ({ ok: true }),
		fire: async () => ({ ok: true }),
		restart: async () => ({ ok: true }),
	},
	staff: { onOutcome: () => unsubscribe },
	update: {
		status: async () => updateStatus,
		onStatus: on("update"),
		apply: async () => undefined,
		cancel: async () => undefined,
		/** As main does: a held update waits while he is busy, and counts down once he is free. */
		setBusy: async (busy: string | null) => {
			if (updateStatus.state !== "available" || !updateStatus.held) return;
			setUpdateStatus({
				...updateStatus,
				held: { ...updateStatus.held, busy, startsAt: busy ? null : Date.now() + UPDATE_FREE_MS },
			});
		},
		previous: async () => ({
			commit: "13e07812c9",
			subject: "Merge bead/office-3iz (rework to spec)",
			dependenciesChanged: false,
		}),
		rollback: async () => ({ ok: false, error: "hud-shot" }),
	},
	whiteboard: fakeWhiteboard,
	pool: {
		get: async () => pool,
		onChanged: on("pool"),
		onFrame: () => unsubscribe,
		join: async () => ({ ok: true }),
		leave: async () => ({ ok: true }),
		setViewing: async () => undefined,
		shoot: async () => ({ ok: true }),
	},
	brainstorm: {
		current: async () => null,
		onChanged: () => unsubscribe,
		start: async () => undefined,
		end: async () => undefined,
	},
	work: {
		get: async () => board,
		onChanged: on("work"),
		create: async () => ({ ok: true, revision: board.state === "ok" ? board.revision : 0 }),
		setPriority: async () => ({ ok: true, revision: 7 }),
		move: async () => ({ ok: true, revision: 7 }),
		assign: async () => ({ ok: true, revision: 7 }),
		respond: async () => ({ ok: true, revision: 7 }),
		dismiss: async () => ({ ok: true, revision: 7 }),
	},
	voice: {
		available: async () => ({ available: true }),
		transcribe: async () => ({ ok: true, value: "" }),
		speak: async () => ({ ok: false, reason: "hud-shot" }),
	},
	whatsNew: {
		get: async () => (freshLaunch ? whatsNew : null),
		rate: async () => ({ ok: true }),
		dismiss: async () => undefined,
	},
	alerts: {
		muted: async () => false,
		setMuted: async () => undefined,
		onChime: () => unsubscribe,
		onOpen: () => unsubscribe,
	},
	snoozes: {
		list: async () => snoozes,
		onChanged: () => unsubscribe,
		snooze: async () => undefined,
		unsnooze: async () => undefined,
	},
	errors: {
		list: async () => errors,
		onChanged: () => unsubscribe,
		report: (report: unknown) => void reports.push(report),
		dismiss: async () => undefined,
		openDevtools: async () => undefined,
	},
	agents: {
		lastReply: async (name: string) =>
			replies[name] ? { text: replies[name], at: NOW - 15 * MIN } : null,
		interrupt: async () => ({ ok: true }),
	},
	worktrees: {
		find: async ({ agent, beads }: { agent: string; beads: string[] }) => {
			const bead = beads[0];
			return bead
				? {
						path: `/home/jeremy/dev/worktrees/${agent}-${bead}`,
						branch: `bead/${bead}`,
						ahead: 3,
						base: "master",
						dirty: agent === "theo",
					}
				: null;
		},
		open: async () => ({ ok: true }),
	},
	away: {
		get: async () => (freshLaunch ? awaySummary : null),
		onSummary: () => unsubscribe,
		dismiss: async () => undefined,
	},
};

const office = tolerant(
	Object.fromEntries(
		Object.entries(api).map(([key, value]) => [
			key,
			typeof value === "object" && value !== null ? tolerant(value, key) : value,
		]),
	),
	"office",
);

Object.defineProperty(window, "office", { value: office });

// Mic popover: a headless browser has no audio inputs.
Object.defineProperty(navigator.mediaDevices ?? {}, "enumerateDevices", {
	value: async () => [
		{ kind: "audioinput", deviceId: "default", label: "Default - Jabra Evolve2 65", groupId: "a" },
		{ kind: "audioinput", deviceId: "jabra", label: "Jabra Evolve2 65 Mono", groupId: "a" },
		{ kind: "audioinput", deviceId: "builtin", label: "Built-in Microphone", groupId: "b" },
	],
});
