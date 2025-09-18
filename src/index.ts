interface Env {
	UPSTREAM_BASE: string;
	PROTECT_PREFIX?: string;
	PRICE_USDC_MICRO?: string;
	CURRENCY?: string;
	NETWORK?: string;
	ASSET?: string;
	RECEIVER?: string;
	TIMEOUT_SECS?: string;
}

const DEFAULT_PREFIX = '/api/';
const DEFAULT_PRICE_MICROS = '10000';
const DEFAULT_CURRENCY = 'USDC';
const DEFAULT_NETWORK = 'base-mainnet';
const DEFAULT_ASSET = 'USDC';
const DEFAULT_RECEIVER = '0x0000000000000000000000000000000000000000';
const DEFAULT_TIMEOUT_SECONDS = 60;

function normalizePrefix(prefix?: string) {
	const trimmed = prefix?.trim();
	if (!trimmed) return DEFAULT_PREFIX;
	return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function buildUpstreamRequest(request: Request, upstreamBase: string) {
	const incoming = new URL(request.url);
	const target = new URL(incoming.pathname + incoming.search, upstreamBase);
	return new Request(target.toString(), request);
}

function parseTimeout(value?: string) {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_SECONDS;
}

function formatMicrosToDecimal(micros: string) {
	if (!/^[0-9]+$/.test(micros)) {
		return '0';
	}

	const value = BigInt(micros);
	const whole = value / 1_000_000n;
	const fraction = value % 1_000_000n;
	if (fraction === 0n) {
		return whole.toString();
	}

	const fractionStr = fraction.toString().padStart(6, '0').replace(/0+$/, '');
	return `${whole.toString()}.${fractionStr}`;
}

function buildPaymentOffer(env: Env, prefix: string) {
	const priceMicros = env.PRICE_USDC_MICRO ?? DEFAULT_PRICE_MICROS;
	const priceDecimal = formatMicrosToDecimal(priceMicros);
	const currency = env.CURRENCY ?? DEFAULT_CURRENCY;
	const network = env.NETWORK ?? DEFAULT_NETWORK;
	const asset = env.ASSET ?? DEFAULT_ASSET;
	const receiver = env.RECEIVER ?? DEFAULT_RECEIVER;
	const timeout = parseTimeout(env.TIMEOUT_SECS);
	const orderId = crypto.randomUUID();

	return {
		x402Version: 1,
		price: priceDecimal,
		currency,
		network,
		receiver,
		orderId,
		maxTimeoutSeconds: timeout,
		accepts: [
			{
				scheme: 'exact',
				network,
				asset,
				maxAmountRequired: priceMicros,
				payTo: receiver,
				resource: `${prefix}*`,
				description: `Access ${prefix} endpoints`,
				mimeType: 'application/json',
				maxTimeoutSeconds: timeout,
				orderId,
			},
		],
	};
}

function paymentRequiredResponse(offer: ReturnType<typeof buildPaymentOffer>) {
	return new Response(JSON.stringify(offer), {
		status: 402,
		headers: {
			'content-type': 'application/json',
			'cache-control': 'no-store',
		},
	});
}

export default {
	async fetch(request, env): Promise<Response> {
		const upstreamBase = env.UPSTREAM_BASE;
		if (!upstreamBase) {
			return new Response('UPSTREAM_BASE is not configured', { status: 500 });
		}

	const prefix = normalizePrefix(env.PROTECT_PREFIX);
	const url = new URL(request.url);
	const isProtected = url.pathname.startsWith(prefix);

	if (isProtected && !request.headers.has('X-PAYMENT')) {
		const offer = buildPaymentOffer(env, prefix);
		return paymentRequiredResponse(offer);
	}

	const upstreamRequest = buildUpstreamRequest(request, upstreamBase);
	return fetch(upstreamRequest);
	},
} satisfies ExportedHandler<Env>;
