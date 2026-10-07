import { useFocus } from "../office/focus/focus-store";
import type { TablePlacement } from "./table-space";

/** Fly the camera above the pool table and open Jeremy's table view (aim, shoot, join). */
export function enterTableView(table: TablePlacement): void {
	useFocus.getState().focus({ kind: "table", table });
}
