import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpClient } from '../../../src/http/HttpClient';
import { EvomiProxyManager } from '../../../src/proxy/EvomiProxyManager';
import { createLogger } from '../../../src/utils/logger';

// Mock axios
vi.mock('axios', () => {
  return {
    default: {
      get: vi.fn(),
    },
  };
});

describe('HttpClient', () => {
  let httpClient: HttpClient;
  let proxyManager: EvomiProxyManager;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger('test');
    proxyManager = new EvomiProxyManager('test-key', logger);
    httpClient = new HttpClient(proxyManager, logger, {
      rateLimitDelayMs: 100, // Short delay for tests
      maxRetries: 3,
      retryDelayMs: 50,
    });
    vi.clearAllMocks();
  });

  it('should create an instance with proxy manager', () => {
    expect(httpClient).toBeDefined();
  });

  it('should make GET request with proxy configuration', async () => {
    const axios = await import('axios');
    vi.mocked(axios.default.get).mockResolvedValue({
      data: '<html>Test</html>',
      status: 200,
      headers: {},
    });

    const response = await httpClient.get('https://www.alljobs.co.il');

    expect(axios.default.get).toHaveBeenCalled();
    expect(response).toBeDefined();
    expect(response.data).toContain('Test');
  });

  it('should include Hebrew headers in requests', async () => {
    const axios = await import('axios');
    vi.mocked(axios.default.get).mockResolvedValue({
      data: '<html>Test</html>',
      status: 200,
      headers: {},
    });

    await httpClient.get('https://www.alljobs.co.il');

    const callArgs = vi.mocked(axios.default.get).mock.calls[0];
    const config = callArgs[1];
    expect(config?.headers).toBeDefined();
    expect(config?.headers['Accept-Language']).toBe('he-IL');
    expect(config?.headers['Accept']).toContain('text/html');
  });

  it('should include User-Agent in requests', async () => {
    const axios = await import('axios');
    vi.mocked(axios.default.get).mockResolvedValue({
      data: '<html>Test</html>',
      status: 200,
      headers: {},
    });

    await httpClient.get('https://www.alljobs.co.il');

    const callArgs = vi.mocked(axios.default.get).mock.calls[0];
    const config = callArgs[1];
    expect(config?.headers['User-Agent']).toBeDefined();
  });

  it('should retry on failure', async () => {
    const axios = await import('axios');
    vi.mocked(axios.default.get)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        data: '<html>Success</html>',
        status: 200,
        headers: {},
      });

    const response = await httpClient.get('https://www.alljobs.co.il');

    expect(axios.default.get).toHaveBeenCalledTimes(3);
    expect(response.data).toContain('Success');
  });

  it('should respect rate limiting', async () => {
    const axios = await import('axios');
    vi.mocked(axios.default.get).mockResolvedValue({
      data: '<html>Test</html>',
      status: 200,
      headers: {},
    });

    const startTime = Date.now();
    await httpClient.get('https://www.alljobs.co.il');
    await httpClient.get('https://www.alljobs.co.il');
    const endTime = Date.now();

    // Should have at least the rate limit delay between requests
    expect(endTime - startTime).toBeGreaterThanOrEqual(90); // Allow some margin
  });

  it('should throw error after max retries', async () => {
    const axios = await import('axios');
    vi.mocked(axios.default.get).mockRejectedValue(new Error('Network error'));

    await expect(
      httpClient.get('https://www.alljobs.co.il')
    ).rejects.toThrow();

    expect(axios.default.get).toHaveBeenCalledTimes(4); // Initial + 3 retries
  });

  it('should use proxy configuration', async () => {
    const axios = await import('axios');
    vi.mocked(axios.default.get).mockResolvedValue({
      data: '<html>Test</html>',
      status: 200,
      headers: {},
    });

    await httpClient.get('https://www.alljobs.co.il');

    const callArgs = vi.mocked(axios.default.get).mock.calls[0];
    const config = callArgs[1];
    expect(config?.proxy).toBeDefined();
  });
});

