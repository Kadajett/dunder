import { type ModelOption, type SetModelResult, shortModelName } from "@shared/models";
import { useMemo, useState } from "react";
import { pickerOrder, useModels } from "./models-store";

const MAX_OPTIONS = 60;

function resultText(result: SetModelResult): string {
	if (result.state === "applied") return "Switched — the agent's session uses it now.";
	if (result.state === "queued") return `Queued: ${result.reason}`;
	return `Not switched: ${result.reason}`;
}

function filterOptions(
	catalog: readonly ModelOption[],
	query: string,
	everyProvider: boolean,
): ModelOption[] {
	const needle = query.trim().toLowerCase();
	return pickerOrder(catalog)
		.filter(
			(option) =>
				everyProvider || option.provider === "anthropic" || option.provider === "openai-codex",
		)
		.filter(
			(option) => !needle || `${option.selector} ${option.name}`.toLowerCase().includes(needle),
		)
		.slice(0, MAX_OPTIONS);
}

/** Shows an agent's live model and switches its omp session to another one. */
export function ModelPicker({ agentName }: { readonly agentName: string }) {
	const live = useModels((state) => state.live[agentName]);
	const catalog = useModels((state) => state.catalog);
	const [query, setQuery] = useState("");
	const [everyProvider, setEveryProvider] = useState(false);
	const [selector, setSelector] = useState<string>();
	const [thinking, setThinking] = useState<string>();
	const [result, setResult] = useState<SetModelResult>();
	const options = useMemo(
		() => filterOptions(catalog, query, everyProvider),
		[catalog, query, everyProvider],
	);
	const chosen = catalog.find((option) => option.selector === selector);
	const current = live?.pending
		? `switching to ${shortModelName(live.pending.model)}…`
		: shortModelName(live?.model);

	const apply = (): void => {
		if (!selector) return;
		setResult(undefined);
		void window.office.models.setModel(agentName, selector, thinking).then(setResult);
	};

	return (
		<section className="model-picker">
			<div className="card-row">
				<span>model</span>
				<code title={live?.model}>
					{current}
					{live?.thinking && !live.pending ? ` · ${live.thinking}` : ""}
				</code>
			</div>
			<input
				type="search"
				placeholder="Find a model (opus, sonnet, gpt, gemini…)"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
			/>
			<select
				size={6}
				value={selector ?? ""}
				onChange={(event) => {
					setSelector(event.target.value);
					setThinking(undefined);
				}}
			>
				{options.map((option) => (
					<option key={option.selector} value={option.selector}>
						{option.name} — {option.selector}
					</option>
				))}
			</select>
			<div className="model-picker-row">
				<label>
					<input
						type="checkbox"
						checked={everyProvider}
						onChange={(e) => setEveryProvider(e.target.checked)}
					/>{" "}
					all providers
				</label>
				<select
					value={thinking ?? ""}
					disabled={!chosen || chosen.thinking.length === 0}
					onChange={(event) => setThinking(event.target.value || undefined)}
				>
					<option value="">default thinking</option>
					{chosen?.thinking.map((level) => (
						<option key={level} value={level}>
							{level}
						</option>
					))}
				</select>
			</div>
			<button type="button" className="card-action" disabled={!selector} onClick={apply}>
				{chosen ? `Switch to ${chosen.name}` : "Pick a model"}
			</button>
			{result ? <p className={`model-result model-${result.state}`}>{resultText(result)}</p> : null}
		</section>
	);
}
