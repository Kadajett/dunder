import { setUpdateStatus } from "./fake-office-hud";

const COMMITS = [
	{ sha: "a91f3c0d2e", subject: "inbox: group repeat app errors (office-k2p.3)" },
	{ sha: "77b2e1a9c4", subject: "work: drag cards between lanes (office-t3c)" },
	{ sha: "3c0e9f12ab", subject: "call: barge-in stops Max mid-sentence (office-b8n)" },
];

/** An agent's update counting down, `seconds` from now (the app gives Jeremy 15 s). */
export function countdown(seconds: number): void {
	setUpdateStatus({
		state: "available",
		head: "a91f3c0d2e",
		commits: COMMITS,
		behind: 3,
		countdown: {
			by: "theo",
			reason: "ship the Trust Inbox error grouping",
			applyAt: Date.now() + seconds * 1000,
			extra: 1,
		},
	});
}

/** Agents' updates queued in the batch window (office-itt): 7 changes, the next update at about 83 min from now. */
export function batched(): void {
	setUpdateStatus({
		state: "available",
		head: "a91f3c0d2e",
		commits: COMMITS.slice(0, 1),
		behind: 7,
		batched: {
			by: "theo",
			reason: "ship the Trust Inbox error grouping",
			extra: 4,
			nextAt: Date.now() + 83 * 60_000,
		},
	});
}
