import "./hud-company.css";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import { useState } from "react";

/** `HERDR OFFICE` → `Herdr Office`. */
function titleCase(text: string): string {
	return text
		.toLowerCase()
		.replace(
			/(^|[\s-])(\p{L})/gu,
			(_match, gap: string, letter: string) => gap + letter.toUpperCase(),
		);
}

/**
 * The company chip: logo, name and the herdr session behind it. Its menu
 * lists the companies that exist — today only this office (more arrive with
 * the company editor).
 */
export function CompanySwitcher({ snapshot }: { readonly snapshot: SessionSnapshot | null }) {
	const [open, setOpen] = useState(false);
	const name = titleCase(DEFAULT_LAYOUT.room.sign.title);
	const subtitle = snapshot ? `office session · herdr ${snapshot.version}` : "connecting to herdr…";
	return (
		<div className="hud-company">
			<button
				type="button"
				className="hud-chip hud-company-chip"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				<span className="hud-logo">{name.charAt(0)}</span>
				<span className="hud-company-text">
					<strong>{name}</strong>
					<small>
						<i className={`status-dot status-${snapshot ? "working" : "unknown"}`} />
						{subtitle}
					</small>
				</span>
				<span className="hud-caret" aria-hidden="true">
					▾
				</span>
			</button>
			{open ? (
				<>
					<button
						type="button"
						className="hud-menu-backdrop"
						aria-label="Close companies"
						onClick={() => setOpen(false)}
					/>
					<div className="hud-menu" role="menu">
						<p className="hud-menu-heading">Companies</p>
						<button
							type="button"
							role="menuitemradio"
							aria-checked="true"
							className="hud-menu-item"
							onClick={() => setOpen(false)}
						>
							<span className="hud-logo hud-logo-small">{name.charAt(0)}</span>
							<span>
								<strong>{name}</strong>
								<small>herdr session “office”</small>
							</span>
							<span className="hud-check">✓</span>
						</button>
					</div>
				</>
			) : null}
		</div>
	);
}
