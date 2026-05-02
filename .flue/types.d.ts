// Markdown imports become string text via wrangler's Text rule (see wrangler.jsonc).
declare module '*.md' {
	const content: string;
	export default content;
}
