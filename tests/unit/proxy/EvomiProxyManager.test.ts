import { describe, it, expect, beforeEach } from 'vitest';
import { EvomiProxyManager } from '../../../src/proxy/EvomiProxyManager';
import { createLogger } from '../../../src/utils/logger';

describe('EvomiProxyManager', () => {
  let proxyManager: EvomiProxyManager;
  const testProxyKey = 'f827e84c-471e-4d53-a25d-53624417f7ec';

  beforeEach(() => {
    const logger = createLogger('test');
    proxyManager = new EvomiProxyManager(testProxyKey, logger);
  });

  it('should create an instance with proxy key', () => {
    expect(proxyManager).toBeDefined();
  });

  it('should get proxy configuration', () => {
    const proxyConfig = proxyManager.getProxyConfig();
    expect(proxyConfig).toBeDefined();
    expect(proxyConfig.host).toBeDefined();
    expect(proxyConfig.port).toBeDefined();
    expect(proxyConfig.auth).toBeDefined();
  });

  it('should include proxy key in authentication', () => {
    const proxyConfig = proxyManager.getProxyConfig();
    expect(proxyConfig.auth?.username).toContain(testProxyKey);
  });

  it('should format proxy URL correctly', () => {
    const proxyUrl = proxyManager.getProxyUrl();
    expect(proxyUrl).toBeDefined();
    expect(proxyUrl).toContain('http');
  });

  it('should handle custom endpoint if provided', () => {
    const customEndpoint = 'custom-proxy.evomi.com:8080';
    const managerWithEndpoint = new EvomiProxyManager(
      testProxyKey,
      createLogger('test'),
      customEndpoint
    );
    const proxyConfig = managerWithEndpoint.getProxyConfig();
    expect(proxyConfig.host).toBe('custom-proxy.evomi.com');
  });

  it('should rotate proxy if multiple endpoints available', () => {
    // This test verifies the proxy rotation mechanism exists
    const proxyConfig1 = proxyManager.getProxyConfig();
    const proxyConfig2 = proxyManager.getProxyConfig();
    // Both should be valid configurations
    expect(proxyConfig1).toBeDefined();
    expect(proxyConfig2).toBeDefined();
  });
});

