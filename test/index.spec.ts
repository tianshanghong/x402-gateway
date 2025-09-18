import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/index';

type TestEnv = {
	UPSTREAM_BASE?: string;
	PROTECT_PREFIX?: string;
	PRICE_USDC_MICRO?: string;
	CURRENCY?: string;
	NETWORK?: string;
	ASSET?: string;
	RECEIVER?: string;
	TIMEOUT_SECS?: string;
};

describe('Payment-gated proxy scaffold', () => {
	const originalFetch = globalThis.fetch;
	let env: TestEnv;

	beforeEach(() => {
		env = {
			UPSTREAM_BASE: 'https://upstream.example',
			PROTECT_PREFIX: '/api/',
			PRICE_USDC_MICRO: '10000',
			CURRENCY: 'USDC',
			NETWORK: 'base-mainnet',
			ASSET: 'USDC',
			RECEIVER: '0xabc',
			TIMEOUT_SECS: '60',
		};
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it('proxies non-protected paths to upstream', async () => {
		const upstreamResponse = new Response('upstream echo', { status: 200 });
		const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
		globalThis.fetch = fetchMock;

		const request = new Request('http://example.com/health');
		const response = await worker.fetch(request, env as any, {} as any);

		expect(await response.text()).toBe('upstream echo');
		expect(fetchMock).toHaveBeenCalledOnce();
		expect((fetchMock.mock.calls[0]?.[0] as Request).url).toBe('https://upstream.example/health');
	});

	it('returns x402 offer when protected path lacks payment header', async () => {
		const randomSpy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('order-test');
		const fetchMock = vi.fn();
		globalThis.fetch = fetchMock;

		const request = new Request('http://example.com/api/hello');
		const response = await worker.fetch(request, env as any, {} as any);

		expect(response.status).toBe(402);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(fetchMock).not.toHaveBeenCalled();

		const body = await response.json();
		expect(body).toMatchObject({
			x402Version: 1,
			price: '0.01',
			currency: 'USDC',
			network: 'base-mainnet',
			receiver: '0xabc',
			orderId: 'order-test',
			maxTimeoutSeconds: 60,
		});
		expect(Array.isArray(body.accepts)).toBe(true);
		expect(body.accepts[0]).toMatchObject({
			scheme: 'exact',
			network: 'base-mainnet',
			asset: 'USDC',
			maxAmountRequired: '10000',
			payTo: '0xabc',
			resource: '/api/*',
			orderId: 'order-test',
			maxTimeoutSeconds: 60,
		});
		expect(randomSpy).toHaveBeenCalledOnce();
	});

	it('proxies protected paths when payment header is present', async () => {
		const upstreamResponse = new Response('protected upstream', { status: 200 });
		const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
		globalThis.fetch = fetchMock;

		const request = new Request('http://example.com/api/hello', {
			headers: { 'X-PAYMENT': 'stub' },
		});
		const response = await worker.fetch(request, env as any, {} as any);

		expect(await response.text()).toBe('protected upstream');
		expect(fetchMock).toHaveBeenCalledOnce();
		expect((fetchMock.mock.calls[0]?.[0] as Request).url).toBe('https://upstream.example/api/hello');
	});

	it('emits unique orderId per payment offer', async () => {
		vi.spyOn(globalThis.crypto, 'randomUUID')
			.mockReturnValueOnce('order-one')
			.mockReturnValueOnce('order-two');

		const first = await worker.fetch(new Request('http://example.com/api/a'), env as any, {} as any);
		const second = await worker.fetch(new Request('http://example.com/api/b'), env as any, {} as any);

		expect(first.status).toBe(402);
		expect(second.status).toBe(402);

		const firstBody = await first.json();
		const secondBody = await second.json();
		expect(firstBody.orderId).toBe('order-one');
		expect(secondBody.orderId).toBe('order-two');
		expect(firstBody.orderId).not.toBe(secondBody.orderId);
	});
});
