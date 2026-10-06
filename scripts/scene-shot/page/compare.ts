import referenceUrl from "../../../docs/reference/orpex-office.png";
import officeUrl from "../../../docs/screenshots/m5-office.png";

/** Loads both images, then flags the page ready for the capture script. */
async function show(id: string, url: string): Promise<void> {
	const image = document.getElementById(id);
	if (!(image instanceof HTMLImageElement)) throw new Error(`compare.html is missing #${id}`);
	image.src = url;
	await image.decode();
}

await Promise.all([show("office", officeUrl), show("reference", referenceUrl)]);
document.body.dataset["sceneReady"] = "true";
