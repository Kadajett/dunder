import { HARNESSES } from "@shared/company/roster";
import { ROLE_PRESETS } from "@shared/company/workforce";
import { ModelField } from "./ModelField";
import type { HireDraft } from "./use-hire-form";

interface HireFieldsProps {
	readonly draft: HireDraft;
	readonly rooms: readonly string[];
	update(patch: Partial<HireDraft>): void;
}

/** Name, role, harness, model, room and project directory of the new hire. */
export function HireFields({ draft, rooms, update }: HireFieldsProps) {
	return (
		<div className="hire-fields">
			<label className="hire-field">
				<span>Name</span>
				<input
					value={draft.name}
					placeholder="e.g. kim"
					maxLength={32}
					spellCheck={false}
					onChange={(event) => update({ name: event.target.value.toLowerCase() })}
				/>
			</label>
			<label className="hire-field">
				<span>Role</span>
				<input value={draft.role} onChange={(event) => update({ role: event.target.value })} />
			</label>
			<div className="hire-chips">
				{ROLE_PRESETS.map((role) => (
					<button
						key={role}
						type="button"
						aria-pressed={draft.role === role}
						onClick={() => update({ role })}
					>
						{role}
					</button>
				))}
			</div>
			<div className="hire-field">
				<span>Harness</span>
				<div className="hire-chips">
					{HARNESSES.map((harness) => (
						<button
							key={harness}
							type="button"
							aria-pressed={draft.harness === harness}
							onClick={() => update({ harness, model: "" })}
						>
							{harness}
						</button>
					))}
				</div>
			</div>
			<div className="hire-field">
				<span>Model</span>
				<ModelField
					harness={draft.harness}
					value={draft.model}
					onChange={(model) => update({ model })}
				/>
			</div>
			<label className="hire-field">
				<span>Room</span>
				<input
					list="hire-rooms"
					value={draft.room}
					placeholder="an existing room, or a new name"
					onChange={(event) => update({ room: event.target.value })}
				/>
				<datalist id="hire-rooms">
					{rooms.map((room) => (
						<option key={room} value={room} />
					))}
				</datalist>
			</label>
			<label className="hire-field">
				<span>Project directory</span>
				<input
					value={draft.cwd}
					spellCheck={false}
					onChange={(event) => update({ cwd: event.target.value })}
				/>
			</label>
		</div>
	);
}
