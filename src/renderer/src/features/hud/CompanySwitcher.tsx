import "./hud-company.css";
import type { Company } from "@shared/company/company";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import { useState } from "react";
import {
	createCompany,
	switchCompany,
	updateCompanySettings,
	useCompanies,
	useCompany,
} from "../company/company-store";
import { CompanyForm } from "./CompanyForm";

const log = createLogger("companies");

type MenuMode = "list" | "create" | "settings";

/**
 * The company chip: logo and name of the company on screen, with the herdr
 * connection as a dot. Its menu switches between companies, creates one and
 * edits the current one's settings (name, subtitle, spend alarm, editor command).
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
				title={company.subtitle ? `${company.subtitle} · ${session}` : session}
				onClick={() => setMode((value) => (value ? undefined : "list"))}
			>
				<span className="hud-logo">{company.name.charAt(0)}</span>
				<strong className="hud-company-name">{company.name}</strong>
				<i className={`status-dot status-${snapshot ? "working" : "unknown"}`} />
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
								onSubmit={({ name, subtitle }) => createCompany(name, subtitle).then(close)}
								onCancel={() => setMode("list")}
							/>
						) : null}
						{mode === "settings" ? (
							<CompanyForm
								heading={`${company.name} settings`}
								submitLabel="Save"
								initialName={company.name}
								initialSubtitle={company.subtitle}
								initialSettings={{
									spendAlarmUsd: company.spendAlarmUsd,
									editorCommand: company.editorCommand,
								}}
								onSubmit={({ name, subtitle, settings }) =>
									updateCompanySettings(company.id, {
										name,
										subtitle,
										spendAlarmUsd: settings?.spendAlarmUsd ?? company.spendAlarmUsd,
										editorCommand: settings?.editorCommand || company.editorCommand,
									}).then(close)
								}
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
				onClick={() => onMode("settings")}
			>
				“{current.name}” settings…
			</button>
		</>
	);
}
