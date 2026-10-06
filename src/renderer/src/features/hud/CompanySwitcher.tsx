import "./hud-company.css";
import type { Company } from "@shared/company/company";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import { useState } from "react";
import {
	createCompany,
	renameCompany,
	switchCompany,
	useCompanies,
	useCompany,
} from "../company/company-store";
import { CompanyForm } from "./CompanyForm";

const log = createLogger("companies");

type MenuMode = "list" | "create" | "rename";

/**
 * The company chip: logo, name and subtitle of the company on screen. Its
 * menu switches between companies, creates one and renames the current one.
 */
export function CompanySwitcher({ snapshot }: { readonly snapshot: SessionSnapshot | null }) {
	const [mode, setMode] = useState<MenuMode | undefined>();
	const company = useCompany();
	const session = snapshot ? `office session · herdr ${snapshot.version}` : "connecting to herdr…";
	const close = (): void => setMode(undefined);
	return (
		<div className="hud-company">
			<button
				type="button"
				className="hud-chip hud-company-chip"
				aria-expanded={mode !== undefined}
				title={session}
				onClick={() => setMode((value) => (value ? undefined : "list"))}
			>
				<span className="hud-logo">{company.name.charAt(0)}</span>
				<span className="hud-company-text">
					<strong>{company.name}</strong>
					<small>
						<i className={`status-dot status-${snapshot ? "working" : "unknown"}`} />
						{company.subtitle || session}
					</small>
				</span>
				<span className="hud-caret" aria-hidden="true">
					▾
				</span>
			</button>
			{mode ? (
				<>
					<button
						type="button"
						className="hud-menu-backdrop"
						aria-label="Close companies"
						onClick={close}
					/>
					<div className="hud-menu" role="menu">
						{mode === "list" ? (
							<CompanyList current={company} onMode={setMode} onClose={close} />
						) : null}
						{mode === "create" ? (
							<CompanyForm
								heading="New company"
								submitLabel="Create"
								initialName=""
								initialSubtitle=""
								onSubmit={(name, subtitle) => createCompany(name, subtitle).then(close)}
								onCancel={() => setMode("list")}
							/>
						) : null}
						{mode === "rename" ? (
							<CompanyForm
								heading={`Rename ${company.name}`}
								submitLabel="Save"
								initialName={company.name}
								initialSubtitle={company.subtitle}
								onSubmit={(name, subtitle) => renameCompany(company.id, name, subtitle).then(close)}
								onCancel={() => setMode("list")}
							/>
						) : null}
					</div>
				</>
			) : null}
		</div>
	);
}

interface CompanyListProps {
	readonly current: Company;
	readonly onMode: (mode: MenuMode) => void;
	readonly onClose: () => void;
}

/** Every company (the current one checked), then the create and rename actions. */
function CompanyList({ current, onMode, onClose }: CompanyListProps) {
	const companies = useCompanies((state) => state.companies);
	const choose = (id: string): void => {
		onClose();
		if (id === current.id) return;
		switchCompany(id).catch((error: unknown) => log.warn("switch failed", { company: id, error }));
	};
	return (
		<>
			<p className="hud-menu-heading">Companies</p>
			{companies.map((company) => (
				<button
					key={company.id}
					type="button"
					role="menuitemradio"
					aria-checked={company.id === current.id}
					className="hud-menu-item"
					onClick={() => choose(company.id)}
				>
					<span className="hud-logo hud-logo-small">{company.name.charAt(0)}</span>
					<span>
						<strong>{company.name}</strong>
						<small>{company.subtitle || "herdr session “office”"}</small>
					</span>
					{company.id === current.id ? <span className="hud-check">✓</span> : null}
				</button>
			))}
			<div className="hud-menu-divider" />
			<button
				type="button"
				role="menuitem"
				className="hud-menu-action"
				onClick={() => onMode("create")}
			>
				New company…
			</button>
			<button
				type="button"
				role="menuitem"
				className="hud-menu-action"
				onClick={() => onMode("rename")}
			>
				Rename “{current.name}”…
			</button>
		</>
	);
}
