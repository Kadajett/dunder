import { tagFor } from "./version.mts";

export const DEFAULT_REPOSITORY = "Kadajett/dunder";

/** Asset file names of one release, as electron-builder names them (package.json build config). */
export interface ReleaseAssetNames {
	appimage: string;
	deb: string;
}

export function releaseAssetNames(version: string): ReleaseAssetNames {
	return {
		appimage: `Dunder-${version}-linux-x86_64.AppImage`,
		deb: `dunder_${version}_amd64.deb`,
	};
}

/** The `latest.json` document attached to every GitHub release and served by the site. */
export interface LatestJson {
	version: string;
	tag: string;
	assets: {
		"linux-x64": {
			/** Absolute download URL of the AppImage. */
			appimage: string;
			/** Absolute download URL of the deb. */
			deb: string;
		};
	};
}

export interface LatestJsonInput {
	version: string;
	/** File names present in the build output directory. */
	files: readonly string[];
	/** `owner/name` of the GitHub repository hosting the release. */
	repository: string;
}

/** Builds `latest.json` from the build output; throws when an expected asset is missing. */
export function buildLatestJson({ version, files, repository }: LatestJsonInput): LatestJson {
	const names = releaseAssetNames(version);
	const missing = Object.values(names).filter((name) => !files.includes(name));
	if (missing.length > 0) {
		throw new Error(`release assets missing for ${version}: ${missing.join(", ")}`);
	}
	const tag = tagFor(version);
	const base = `https://github.com/${repository}/releases/download/${tag}`;
	return {
		version,
		tag,
		assets: {
			"linux-x64": {
				appimage: `${base}/${encodeURIComponent(names.appimage)}`,
				deb: `${base}/${encodeURIComponent(names.deb)}`,
			},
		},
	};
}
