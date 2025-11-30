import type { Logger } from '../utils/logger';

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
 */
export class EvomiProxyManager {
  private readonly proxyKey: string;
  private readonly logger: Logger;
  private readonly endpoint?: string;

  /**
   * Creates a new EvomiProxyManager instance
   * @param proxyKey - Evomi API key for proxy authentication
   * @param logger - Logger instance for logging
   * @param endpoint - Optional custom proxy endpoint (host:port format)
   */
  constructor(proxyKey: string, logger: Logger, endpoint?: string) {
    if (!proxyKey || proxyKey.trim().length === 0) {
      throw new Error('Evomi proxy key is required');
    }
    this.proxyKey = proxyKey;
    this.logger = logger;
    this.endpoint = endpoint;
  }

  /**
   * Gets proxy configuration for axios/HTTP client
   * @returns Proxy configuration object
   */
  getProxyConfig(): ProxyConfig {
    // Evomi residential proxies typically use format: username:password@host:port
    // For residential proxies, the API key is used as username, and sometimes a session ID as password
    const [host, port] = this.getHostAndPort();

    return {
      host,
      port,
      auth: {
        username: this.proxyKey,
        password: '', // Some proxy providers use empty password or session ID
      },
    };
  }

  /**
   * Gets proxy URL in format: http://username:password@host:port
   * @returns Proxy URL string
   */
  getProxyUrl(): string {
    const [host, port] = this.getHostAndPort();
    // Evomi format: http://api-key@host:port or http://api-key:session@host:port
    return `http://${this.proxyKey}@${host}:${port}`;
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
    // NOTE: You need to provide the correct endpoint via EVOMI_PROXY_ENDPOINT env variable
    // or check Evomi dashboard for the correct endpoint
    // For testing without proxy, leave EVOMI_PROXY_ENDPOINT empty and the code will run without proxy
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
        return false;
      }
      this.logger.debug('Proxy configuration validated', {
        host: config.host,
        port: config.port,
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to validate proxy', { error });
      return false;
    }
  }
}

