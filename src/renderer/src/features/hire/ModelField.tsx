import type { Harness } from "@shared/company/roster";
import { useMemo, useState } from "react";
import { pickerOrder, useModels } from "../office/models/models-store";

const MAX_OPTIONS = 60;

interface ModelFieldProps {
	readonly harness: Harness;
	/** `selector[:thinking]` for omp, free text otherwise; empty = the harness default. */
	readonly value: string;
	onChange(value: string): void;
}

const PLACEHOLDER: Record<Exclude<Harness, "omp">, string> = {
	claude: "default, or opus / sonnet / a full model name",
	codex: "default, or e.g. gpt-5-codex",
};

/** omp: search the catalog and pick a thinking level. claude/codex: type a model name. */
export function ModelField({ harness, value, onChange }: ModelFieldProps) {
	const catalog = useModels((state) => state.catalog);
	const [query, setQuery] = useState("");
	const options = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return pickerOrder(catalog)
			.filter((option) => `${option.selector} ${option.name}`.toLowerCase().includes(needle))
			.slice(0, MAX_OPTIONS);
	}, [catalog, query]);
	if (harness !== "omp") {
		return (
			<input
				value={value}
				placeholder={PLACEHOLDER[harness]}
				onChange={(event) => onChange(event.target.value)}
			/>
		);
	}
	const chosen = catalog.find(
		(option) => value === option.selector || value.startsWith(`${option.selector}:`),
	);
	const thinking =
		chosen && value.length > chosen.selector.length ? value.slice(chosen.selector.length + 1) : "";
	return (
		<div className="hire-model">
			<input
				type="search"
				placeholder="Find a model (opus, sonnet, gpt, gemini…)"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
			/>
			<select size={5} value={chosen?.selector ?? ""} onChange={(e) => onChange(e.target.value)}>
				<option value="">omp default model</option>
				{options.map((option) => (
					<option key={option.selector} value={option.selector}>
						{option.name} — {option.selector}
					</option>
				))}
			</select>
			<select
				value={thinking}
				disabled={!chosen || chosen.thinking.length === 0}
				onChange={(event) => {
					if (!chosen) return;
					const level = event.target.value;
					onChange(level ? `${chosen.selector}:${level}` : chosen.selector);
				}}
			>
				<option value="">default thinking</option>
				{chosen?.thinking.map((level) => (
					<option key={level} value={level}>
						{level}
					</option>
				))}
			</select>
		</div>
	);
}
