import type { Logger } from '../utils/logger';
import type { ProxyStatusTracker } from '../monitoring/ProxyStatusTracker';

/**
 * Proxy configuration for HTTP requests
 */
export interface ProxyConfig {
  host: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
}

/**
 * Manages Evomi proxy connections and authentication
 * Supports proxy rotation to avoid IP blocking
 */
export class EvomiProxyManager {
  private readonly proxyKey: string;
  private readonly logger: Logger;
  private readonly endpoint?: string;
  private readonly proxyStatusTracker?: ProxyStatusTracker;
  private requestCount: number = 0;
  private readonly rotationInterval: number = 10; // Rotate proxy every 10 requests
  private lastRotationHost: string = '';
  private lastRotationPort: number = 0;

  /**
   * Creates a new EvomiProxyManager instance
   * @param proxyKey - Evomi API key for proxy authentication
   * @param logger - Logger instance for logging
   * @param endpoint - Optional custom proxy endpoint (host:port format)
   * @param proxyStatusTracker - Optional proxy status tracker for monitoring
   */
  constructor(proxyKey: string, logger: Logger, endpoint?: string, proxyStatusTracker?: ProxyStatusTracker) {
    // Allow empty proxy key for running without proxy
    if (!proxyKey || proxyKey.trim().length === 0 || proxyKey === 'dummy-key' || proxyKey === 'dummy-key-for-no-proxy') {
      this.proxyKey = '';
      this.logger = logger;
      this.endpoint = undefined;
      this.proxyStatusTracker = proxyStatusTracker;
      if (this.proxyStatusTracker) {
        this.proxyStatusTracker.setProxyConfig('', 0, false);
      }
      this.logger.warn('No proxy key provided - running without proxy');
      return;
    }
    this.proxyKey = proxyKey;
    this.logger = logger;
    this.endpoint = endpoint;
    this.proxyStatusTracker = proxyStatusTracker;
    
    // Initialize proxy status tracker
    const [host, port] = this.getHostAndPort();
    if (this.proxyStatusTracker && host && port) {
      this.proxyStatusTracker.setProxyConfig(host, port, true);
      this.lastRotationHost = host;
      this.lastRotationPort = port;
    }
  }

  /**
   * Gets proxy configuration for axios/HTTP client
   * Rotates proxy by adding session ID to force new IP
   * @returns Proxy configuration object
   */
  getProxyConfig(): ProxyConfig {
    // Evomi residential proxies typically use format: username:password@host:port
    // For residential proxies, the API key is used as username, and sometimes a session ID as password
    const [host, port] = this.getHostAndPort();

    // Rotate proxy by incrementing session ID every N requests
    // This forces Evomi to assign a new IP address
    const previousSessionId = Math.floor(this.requestCount / this.rotationInterval);
    this.requestCount++;
    const sessionId = Math.floor(this.requestCount / this.rotationInterval);
    
    // If we've rotated, log it and track it
    if (sessionId !== previousSessionId) {
      this.logger.debug('Rotating proxy', { 
        requestCount: this.requestCount, 
        sessionId,
        rotationInterval: this.rotationInterval 
      });
      
      // Track rotation if status tracker is available
      if (this.proxyStatusTracker && host && port) {
        // Only track if host/port actually changed (for now, we track session change as rotation)
        if (host !== this.lastRotationHost || port !== this.lastRotationPort) {
          this.proxyStatusTracker.recordRotation(host, port);
          this.lastRotationHost = host;
          this.lastRotationPort = port;
        } else {
          // Session ID changed but host/port same - still count as rotation
          this.proxyStatusTracker.recordRotation(host, port);
        }
      }
    }

    return {
      host,
      port,
      auth: {
        username: `customer-${this.proxyKey}`, // Evomi format: customer-{API_KEY}
        password: `session-${sessionId}`, // Use session ID to force proxy rotation
      },
    };
  }

  /**
   * Gets proxy URL in format: http://username:password@host:port
   * Includes session ID for proxy rotation
   * @returns Proxy URL string
   */
  getProxyUrl(): string {
    const [host, port] = this.getHostAndPort();
    const sessionId = Math.floor(this.requestCount / this.rotationInterval);
    // Evomi format: http://customer-{API_KEY}:{session}@host:port
    // Session ID forces proxy rotation
    return `http://customer-${this.proxyKey}:session-${sessionId}@${host}:${port}`;
  }

  /**
   * Gets host and port from endpoint or uses default Evomi endpoints
   * @returns Tuple of [host, port]
   */
  private getHostAndPort(): [string, number] {
    if (this.endpoint) {
      const [host, portStr] = this.endpoint.split(':');
      const port = portStr ? parseInt(portStr, 10) : 8080;
      return [host, port];
    }

    // Default Evomi residential proxy endpoints
    // Try common Evomi endpoints if no endpoint specified but proxy key exists
    if (this.proxyKey && this.proxyKey.trim().length > 0) {
      // Evomi residential proxy endpoint: rp.evomi.com:1001 (HTTPS)
      const defaultEndpoint = 'rp.evomi.com:1001';
      const [host, portStr] = defaultEndpoint.split(':');
      const port = portStr ? parseInt(portStr, 10) : 1001;
      this.logger.info('Using default Evomi proxy endpoint', { host, port });
      return [host, port];
    }

    // No proxy key - run without proxy
    this.logger.warn('No proxy endpoint provided. Running without proxy. Set EVOMI_PROXY_ENDPOINT to use proxy.');
    return ['', 0]; // Return empty to disable proxy
  }

  /**
   * Validates proxy connection (can be extended to test actual connectivity)
   * @returns Promise that resolves if proxy is valid
   */
  async validateProxy(): Promise<boolean> {
    try {
      const config = this.getProxyConfig();
      if (!config.host || !config.port) {
        this.logger.warn('Invalid proxy configuration', { config });
        if (this.proxyStatusTracker) {
          this.proxyStatusTracker.recordValidation(false);
        }
        return false;
      }
      this.logger.debug('Proxy configuration validated', {
        host: config.host,
        port: config.port,
      });
      if (this.proxyStatusTracker) {
        this.proxyStatusTracker.recordValidation(true);
      }
      return true;
    } catch (error) {
      this.logger.error('Failed to validate proxy', { error });
      if (this.proxyStatusTracker) {
        this.proxyStatusTracker.recordValidation(false);
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.proxyStatusTracker.recordProxyError(errorMessage);
      }
      return false;
    }
  }

  /**
   * Record a proxy error (called from HttpClient when proxy fails)
   */
  recordProxyError(error: string, url?: string): void {
    if (this.proxyStatusTracker) {
      this.proxyStatusTracker.recordProxyError(error, url);
    }
  }

  /**
   * Record a proxy request result (called from HttpClient)
   */
  recordProxyRequest(success: boolean, responseTimeMs: number): void {
    if (this.proxyStatusTracker) {
      this.proxyStatusTracker.recordProxyRequest(success, responseTimeMs);
    }
  }
}

