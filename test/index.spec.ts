import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/index';

type TestEnv = {
	UPSTREAM_BASE: string;
	PROTECT_PREFIX: string;
};

describe('Proxy worker scaffold', () => {
	const originalFetch = globalThis.fetch;
	let env: TestEnv;

	beforeEach(() => {
		env = {
			UPSTREAM_BASE: 'https://upstream.example',
			PROTECT_PREFIX: '/api/',
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
		expect(fetchMock.mock.calls[0]?.[0]).toBeInstanceOf(Request);
		expect((fetchMock.mock.calls[0]?.[0] as Request).url).toBe('https://upstream.example/health');
	});

	it('proxies protected paths (payment enforcement comes later)', async () => {
		const upstreamResponse = new Response('protected upstream', { status: 200 });
		const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
		globalThis.fetch = fetchMock;

		const request = new Request('http://example.com/api/hello');
		const response = await worker.fetch(request, env as any, {} as any);

		expect(await response.text()).toBe('protected upstream');
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(fetchMock.mock.calls[0]?.[0]).toBeInstanceOf(Request);
		expect((fetchMock.mock.calls[0]?.[0] as Request).url).toBe('https://upstream.example/api/hello');
	});

	it('returns 500 when upstream base is missing', async () => {
		const fetchMock = vi.fn();
		globalThis.fetch = fetchMock;

		const request = new Request('http://example.com/api/hello');
		const response = await worker.fetch(request, { PROTECT_PREFIX: '/api/' } as any, {} as any);

		expect(response.status).toBe(500);
		expect(await response.text()).toContain('UPSTREAM_BASE');
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
