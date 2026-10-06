import type { DecorKind } from "@shared/layout/schema";
import type { ComponentType } from "react";
import { WallTv } from "../tv/WallTv";
import { FloorLamp, Printer, ServerRack, WaterCooler } from "./equipment";
import { Plant, TallPlant } from "./plants";
import type { DecorProps } from "./props";
import { Armchair, CoffeeTable, Sofa } from "./seating";
import { NoticeBoard, ReceptionDesk } from "./signage";
import { Bookshelf, MailCubby } from "./storage";
import { WallBell, WallClock } from "./wall-items";

export type { DecorProps } from "./props";

/**
 * Component for every decor kind. Floor kinds stand on y = 0 centred on their footprint;
 * wall kinds (wall-bell, wall-clock, wall-tv) have their back plane at z = 0 and are
 * centred on the origin. Fronts face local +z.
 */
export const DECOR: Record<DecorKind, ComponentType<DecorProps>> = {
	plant: Plant,
	"tall-plant": TallPlant,
	bookshelf: Bookshelf,
	sofa: Sofa,
	armchair: Armchair,
	"coffee-table": CoffeeTable,
	"reception-desk": ReceptionDesk,
	"server-rack": ServerRack,
	"wall-bell": WallBell,
	"wall-clock": WallClock,
	"floor-lamp": FloorLamp,
	"mail-cubby": MailCubby,
	"notice-board": NoticeBoard,
	"water-cooler": WaterCooler,
	printer: Printer,
	"wall-tv": WallTv,
};
