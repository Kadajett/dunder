// troika-three-text ships typings under dist/types without pointing package.json at them.
declare module "troika-three-text" {
	export function configureTextBuilder(config: { readonly useWorker?: boolean }): void;
}
