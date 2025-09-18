interface Env {
	UPSTREAM_BASE: string;
	PROTECT_PREFIX: string;
}

const DEFAULT_PREFIX = "/api/";

function normalizePrefix(prefix?: string) {
	const safe = prefix?.trim();
	return safe && safe.startsWith("/") ? safe : DEFAULT_PREFIX;
}

function buildUpstreamRequest(request: Request, upstreamBase: string) {
	const incoming = new URL(request.url);
	const target = new URL(incoming.pathname + incoming.search, upstreamBase);
	return new Request(target, request);
}

export default {
	async fetch(request, env): Promise<Response> {
		const upstreamBase = env.UPSTREAM_BASE;

		if (!upstreamBase) {
			return new Response("UPSTREAM_BASE is not configured", { status: 500 });
		}

		const prefix = normalizePrefix(env.PROTECT_PREFIX);
		const url = new URL(request.url);
		const protectedPath = url.pathname.startsWith(prefix);

		// WW-74: Always proxy to upstream. Payment checks will be added in follow-up tasks.
		const upstreamRequest = buildUpstreamRequest(request, upstreamBase);

		if (!protectedPath) {
			return fetch(upstreamRequest);
		}

		return fetch(upstreamRequest);
	},
} satisfies ExportedHandler<Env>;
