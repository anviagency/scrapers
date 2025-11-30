import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { EvomiProxyManager } from '../proxy/EvomiProxyManager';
import type { Logger } from '../utils/logger';

/**
 * Configuration for HTTP client
 */
export interface HttpClientConfig {
  rateLimitDelayMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * HTTP client with proxy support, retry logic, and rate limiting
 */
export class HttpClient {
  private readonly proxyManager: EvomiProxyManager;
  private readonly logger: Logger;
  private readonly config: HttpClientConfig;
  private lastRequestTime: number = 0;
  private readonly userAgents: string[] = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];

  /**
   * Creates a new HttpClient instance
   * @param proxyManager - Proxy manager for proxy configuration
   * @param logger - Logger instance
   * @param config - HTTP client configuration
   */
  constructor(
    proxyManager: EvomiProxyManager,
    logger: Logger,
    config: HttpClientConfig
  ) {
    this.proxyManager = proxyManager;
    this.logger = logger;
    this.config = config;
  }

  /**
   * Makes a GET request with proxy, retries, and rate limiting
   * @param url - URL to fetch
   * @param additionalHeaders - Optional additional headers
   * @returns Promise resolving to Axios response
   */
  async get(
    url: string,
    additionalHeaders?: Record<string, string>
  ): Promise<AxiosResponse> {
    await this.enforceRateLimit();

    const proxyConfig = this.proxyManager.getProxyConfig();
    const userAgent = this.getRandomUserAgent();

    const requestConfig: AxiosRequestConfig = {
      method: 'GET',
      url,
      ...(proxyConfig.host && proxyConfig.port && {
        proxy: {
          host: proxyConfig.host,
          port: proxyConfig.port,
          auth: proxyConfig.auth,
        },
      }),
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...additionalHeaders,
      },
      timeout: 30000, // 30 seconds timeout
      validateStatus: (status) => status >= 200 && status < 400,
    };

    return this.executeWithRetry(url, requestConfig);
  }

  /**
   * Executes request with retry logic and exponential backoff
   * @param url - URL being requested
   * @param config - Axios request configuration
   * @returns Promise resolving to Axios response
   */
  private async executeWithRetry(
    url: string,
    config: AxiosRequestConfig
  ): Promise<AxiosResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        this.logger.debug('Making HTTP request', {
          url,
          attempt: attempt + 1,
          maxRetries: this.config.maxRetries,
        });

        const response = await axios(config);
        this.lastRequestTime = Date.now();

        if (response.status >= 200 && response.status < 400) {
          this.logger.debug('Request successful', {
            url,
            status: response.status,
            attempt: attempt + 1,
          });
          return response;
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          this.logger.warn('Request failed, retrying', {
            url,
            attempt: attempt + 1,
            error: lastError.message,
            delayMs: delay,
          });

          await this.sleep(delay);
        } else {
          this.logger.error('Request failed after all retries', {
            url,
            attempts: attempt + 1,
            error: lastError.message,
          });
        }
      }
    }

    throw new Error(
      `Failed to fetch ${url} after ${this.config.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Enforces rate limiting between requests
   */
  private async enforceRateLimit(): Promise<void> {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.rateLimitDelayMs) {
      const waitTime = this.config.rateLimitDelayMs - timeSinceLastRequest;
      this.logger.debug('Rate limiting', { waitTimeMs: waitTime });
      await this.sleep(waitTime);
    }
  }

  /**
   * Gets a random User-Agent string
   * @returns User-Agent string
   */
  private getRandomUserAgent(): string {
    const index = Math.floor(Math.random() * this.userAgents.length);
    return this.userAgents[index];
  }

  /**
   * Sleeps for specified milliseconds
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

