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
 * Options for creating an EvomiProxyManager instance
 */
export interface EvomiProxyManagerOptions {
  proxyKey: string;
  logger: Logger;
  endpoint?: string;
  proxyStatusTracker?: ProxyStatusTracker;
  /** Custom username for proxy auth (overrides default customer-{key} format) */
  username?: string;
  /** Custom password for proxy auth (overrides session-based rotation) */
  password?: string;
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
  private readonly customUsername?: string;
  private readonly customPassword?: string;
  private requestCount: number = 0;
  private readonly rotationInterval: number = 10; // Rotate proxy every 10 requests
  private sessionCounter: number = 0; // Counter for generating unique session IDs
  private lastSessionId: string = ''; // Last generated session ID for logging

  /**
   * Creates a new EvomiProxyManager instance
   * @param proxyKeyOrOptions - Evomi API key for proxy authentication, or options object
   * @param logger - Logger instance for logging (ignored if options object is passed)
   * @param endpoint - Optional custom proxy endpoint (host:port format) (ignored if options object is passed)
   * @param proxyStatusTracker - Optional proxy status tracker for monitoring (ignored if options object is passed)
   */
  constructor(proxyKeyOrOptions: string | EvomiProxyManagerOptions, logger?: Logger, endpoint?: string, proxyStatusTracker?: ProxyStatusTracker) {
    // Support both old signature and new options object
    let proxyKey: string;
    let loggerInstance: Logger;
    let endpointValue: string | undefined;
    let trackerInstance: ProxyStatusTracker | undefined;
    let customUsername: string | undefined;
    let customPassword: string | undefined;

    if (typeof proxyKeyOrOptions === 'object') {
      proxyKey = proxyKeyOrOptions.proxyKey;
      loggerInstance = proxyKeyOrOptions.logger;
      endpointValue = proxyKeyOrOptions.endpoint;
      trackerInstance = proxyKeyOrOptions.proxyStatusTracker;
      customUsername = proxyKeyOrOptions.username;
      customPassword = proxyKeyOrOptions.password;
    } else {
      proxyKey = proxyKeyOrOptions;
      loggerInstance = logger!;
      endpointValue = endpoint;
      trackerInstance = proxyStatusTracker;
    }

    // Allow empty proxy key for running without proxy
    if (!proxyKey || proxyKey.trim().length === 0 || proxyKey === 'dummy-key' || proxyKey === 'dummy-key-for-no-proxy') {
      this.proxyKey = '';
      this.logger = loggerInstance;
      this.endpoint = undefined;
      this.proxyStatusTracker = trackerInstance;
      this.customUsername = customUsername;
      this.customPassword = customPassword;
      if (this.proxyStatusTracker) {
        this.proxyStatusTracker.setProxyConfig('', 0, false);
      }
      this.logger.warn('No proxy key provided - running without proxy');
      return;
    }
    this.proxyKey = proxyKey;
    this.logger = loggerInstance;
    this.endpoint = endpointValue;
    this.proxyStatusTracker = trackerInstance;
    this.customUsername = customUsername;
    this.customPassword = customPassword;
    
    // Initialize proxy status tracker
    const [host, port] = this.getHostAndPort();
    if (this.proxyStatusTracker && host && port) {
      this.proxyStatusTracker.setProxyConfig(host, port, true);
    }
  }

  /**
   * Generates a unique alphanumeric session ID (6-10 characters)
   * Combines counter, timestamp, and random chars for uniqueness
   * @returns Unique alphanumeric session ID
   */
  private generateSessionId(): string {
    this.sessionCounter++;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const timestamp = Date.now().toString(36).slice(-4); // Last 4 chars of base36 timestamp
    const counter = this.sessionCounter.toString(36).padStart(2, '0').slice(-2); // 2 chars from counter
    
    // Add 2-4 random chars to reach 6-10 total chars
    let randomPart = '';
    const randomLength = 2 + Math.floor(Math.random() * 3); // 2-4 random chars
    for (let i = 0; i < randomLength; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    this.lastSessionId = `${timestamp}${counter}${randomPart}`;
    return this.lastSessionId;
  }

  /**
   * Gets the last generated session ID (for logging purposes)
   * @returns Last session ID string
   */
  getLastSessionId(): string {
    return this.lastSessionId;
  }

  /**
   * Builds the password with session ID for rotation
   * If custom password is provided, appends session ID after _session- or adds it
   * @param sessionId - The unique session ID to use
   * @returns Complete password string
   */
  private buildPasswordWithSession(sessionId: string): string {
    if (this.customPassword) {
      // If custom password ends with 'session-', just append the session ID
      if (this.customPassword.endsWith('session-')) {
        return `${this.customPassword}${sessionId}`;
      }
      // If custom password contains '_session-' followed by something, replace it
      if (this.customPassword.includes('_session-')) {
        return this.customPassword.replace(/_session-[a-zA-Z0-9]*$/, `_session-${sessionId}`);
      }
      // Otherwise, append _session-{id} to the custom password
      return `${this.customPassword}_session-${sessionId}`;
    }
    // Default format for Evomi when no custom password
    return `session-${sessionId}`;
  }

  /**
   * Gets proxy configuration for axios/HTTP client
   * Rotates proxy by adding unique session ID to force new IP
   * @returns Proxy configuration object
   */
  getProxyConfig(): ProxyConfig {
    // Evomi residential proxies typically use format: username:password@host:port
    // For residential proxies, the API key is used as username, and sometimes a session ID as password
    const [host, port] = this.getHostAndPort();

    // Generate unique session ID for each rotation interval
    // This forces Evomi to assign a new IP address
    const previousRotation = Math.floor(this.requestCount / this.rotationInterval);
    this.requestCount++;
    const currentRotation = Math.floor(this.requestCount / this.rotationInterval);
    
    // Generate a new session ID (unique per request for concurrent safety)
    const sessionId = this.generateSessionId();
    
    // If we've rotated, log it and track it
    if (currentRotation !== previousRotation) {
      this.logger.debug('Rotating proxy session', { 
        requestCount: this.requestCount, 
        sessionId,
        rotationInterval: this.rotationInterval 
      });
      
      // Track rotation if status tracker is available
      if (this.proxyStatusTracker && host && port) {
        this.proxyStatusTracker.recordRotation(host, port);
      }
    }

    // Use custom credentials if provided, otherwise use Evomi format
    const username = this.customUsername || `customer-${this.proxyKey}`;
    const password = this.buildPasswordWithSession(sessionId);

    return {
      host,
      port,
      auth: {
        username,
        password,
      },
    };
  }

  /**
   * Gets proxy URL in format: http://username:password@host:port
   * Includes unique session ID for proxy rotation
   * @returns Proxy URL string
   */
  getProxyUrl(): string {
    const [host, port] = this.getHostAndPort();
    // Generate unique session ID for this request
    const sessionId = this.generateSessionId();
    // Use custom credentials if provided, otherwise use Evomi format
    const username = this.customUsername || `customer-${this.proxyKey}`;
    const password = this.buildPasswordWithSession(sessionId);
    return `http://${username}:${password}@${host}:${port}`;
  }

  /**
   * Gets host and port from endpoint or uses default Evomi endpoints
   * @returns Tuple of [host, port]
   */
  private getHostAndPort(): [string, number] {
    if (this.endpoint) {
      // Strip protocol (http://, https://) if present
      let cleanEndpoint = this.endpoint;
      if (cleanEndpoint.startsWith('https://')) {
        cleanEndpoint = cleanEndpoint.replace('https://', '');
      } else if (cleanEndpoint.startsWith('http://')) {
        cleanEndpoint = cleanEndpoint.replace('http://', '');
      }
     
      const [host, portStr] = cleanEndpoint.split(':');
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

