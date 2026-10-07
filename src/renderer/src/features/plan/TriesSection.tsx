import { createLogger } from "@shared/log/logger";
import type { TryRating, TryToRate } from "@shared/whats-new";
import { useEffect, useState } from "react";
import { BeadChip } from "../chief/BeadChip";

const log = createLogger("day-end");

const api = () =>
	"whatsNew" in window.office && "tries" in window.office.whatsNew ? window.office.whatsNew : null;

/** Today's 'Try these' still unrated, loaded when Day's end shows. */
function useTries(): readonly [readonly TryToRate[], (rows: readonly TryToRate[]) => void] {
	const [tries, setTries] = useState<readonly TryToRate[]>([]);
	useEffect(() => {
		const whatsNew = api();
		if (!whatsNew) return;
		let live = true;
		whatsNew.tries().then(
			(rows) => live && setTries(rows),
			(error: unknown) => log.warn("no try-these for Day's end", { error }),
		);
		return () => {
			live = false;
		};
	}, []);
	return [tries, setTries];
}

const CHOICES: readonly {
	readonly rating: TryRating;
	readonly label: string;
	readonly title: string;
}[] = [
	{ rating: "up", label: "👍", title: "Works for me" },
	{ rating: "down", label: "👎", title: "Something's off (Max hears about it)" },
	{
		rating: "untried",
		label: "Didn't try",
		title: "Didn't get to it (kept between you and the app)",
	},
];

/**
 * Day's end asks once how today's 'Try these' landed, after Jeremy has
 * lived with them: 👍 / 👎 work like What's new's thumbs, 'Didn't try' is an
 * answer too. A rated row goes; with none left the section is gone.
 */
export function TriesSection() {
	const [tries, setTries] = useTries();
	const [error, setError] = useState<string | null>(null);
	if (tries.length === 0) return null;
	const rate = (row: TryToRate, rating: TryRating): void => {
		const whatsNew = api();
		if (!whatsNew) return;
		setTries(tries.filter((each) => each.id !== row.id));
		setError(null);
		whatsNew.rateTry({ id: row.id, rating }).then(
			(result) => {
				if (result.ok) return;
				setError(result.reason);
				setTries([row, ...tries.filter((each) => each.id !== row.id)]);
			},
			(failure: unknown) => setError(String(failure)),
		);
	};
	return (
		<section className="day-end__tries" aria-label="How did today's changes land?">
			<p className="day-end__tries-heading">How did today's changes land?</p>
			<ul>
				{tries.map((row) => (
					<li key={row.id} className="day-end__try">
						<div className="day-end__try-head">
							<BeadChip id={row.id} code={false} />
							<span className="day-end__try-title">{row.title}</span>
						</div>
						<p className="day-end__try-it">Try it: {row.tryIt}</p>
						<div className="day-end__try-choices">
							{CHOICES.map((choice) => (
								<button
									key={choice.rating}
									type="button"
									title={choice.title}
									onClick={() => rate(row, choice.rating)}
								>
									{choice.label}
								</button>
							))}
						</div>
					</li>
				))}
			</ul>
			{error ? <p className="plan__error">{error}</p> : null}
		</section>
	);
}
