import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { EvomiProxyManager } from '../proxy/EvomiProxyManager';
import type { Logger } from '../utils/logger';
import type { ActivityLogger, ActivitySource } from '../monitoring/ActivityLogger';

/**
 * Configuration for HTTP client
 */
export interface HttpClientConfig {
  rateLimitDelayMs: number;
  maxRetries: number;
  retryDelayMs: number;
  useProxy?: boolean; // Whether to use proxy - defaults to false (disabled)
  source?: ActivitySource; // Source identifier for activity logging
  activityLogger?: ActivityLogger; // Optional activity logger
}

/**
 * HTTP client with proxy support, retry logic, and rate limiting
 */
export class HttpClient {
  private readonly proxyManager: EvomiProxyManager;
  private readonly logger: Logger;
  private readonly config: HttpClientConfig;
  private readonly useProxy: boolean;
  private readonly activityLogger?: ActivityLogger;
  private readonly source?: ActivitySource;
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
    // Proxy is DISABLED by default - set useProxy: true to enable
    this.useProxy = config.useProxy === true;
    this.activityLogger = config.activityLogger;
    this.source = config.source;
    
    if (this.useProxy) {
      this.logger.info('Proxy ENABLED - will use proxy for requests');
    } else {
      this.logger.info('Proxy DISABLED - using direct connections (faster, more reliable)');
    }
  }

  /**
   * Makes a POST request with proxy, retries, and rate limiting
   * @param url - URL to post to
   * @param data - Request body data
   * @param additionalHeaders - Optional additional headers
   * @returns Promise resolving to Axios response
   */
  async post(
    url: string,
    data: any,
    additionalHeaders?: Record<string, string>
  ): Promise<AxiosResponse> {
    await this.enforceRateLimit();

    const userAgent = this.getRandomUserAgent();

    // Only create proxy agent if proxy is explicitly enabled
    let httpsAgent = undefined;
    let sessionId: string | undefined;
    if (this.useProxy) {
      const proxyConfig = this.proxyManager.getProxyConfig();
      sessionId = this.proxyManager.getLastSessionId();
      if (proxyConfig.host && proxyConfig.port) {
        const proxyUrl = this.proxyManager.getProxyUrl();
        this.logger.info('HTTP POST request with proxy', { 
          url: url.substring(0, 100), 
          proxyHost: proxyConfig.host, 
          proxyPort: proxyConfig.port,
          sessionId,
        });
        httpsAgent = new HttpsProxyAgent(proxyUrl);
      }
    } else {
      this.logger.debug('HTTP POST request (no proxy)', { url: url.substring(0, 100) });
    }

    const requestConfig: AxiosRequestConfig = {
      method: 'POST',
      url,
      data,
      // Use httpsAgent instead of proxy config for proper HTTPS tunneling
      ...(httpsAgent && { httpsAgent, proxy: false }),
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': '*/*',
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'DNT': '1',
        ...additionalHeaders,
      },
      timeout: 30000, // 30 seconds timeout
      validateStatus: (status) => status >= 200 && status < 400,
    };

    return this.executeWithRetry(url, requestConfig, sessionId);
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

    const userAgent = this.getRandomUserAgent();

    // Only create proxy agent if proxy is explicitly enabled
    let httpsAgent = undefined;
    let sessionId: string | undefined;
    if (this.useProxy) {
      const proxyConfig = this.proxyManager.getProxyConfig();
      sessionId = this.proxyManager.getLastSessionId();
      if (proxyConfig.host && proxyConfig.port) {
        const proxyUrl = this.proxyManager.getProxyUrl();
        this.logger.info('HTTP GET request with proxy', { 
          url: url.substring(0, 100), 
          proxyHost: proxyConfig.host, 
          proxyPort: proxyConfig.port,
          sessionId,
        });
        httpsAgent = new HttpsProxyAgent(proxyUrl);
      }
    } else {
      this.logger.debug('HTTP GET request (no proxy)', { url: url.substring(0, 100) });
    }

    const requestConfig: AxiosRequestConfig = {
      method: 'GET',
      url,
      // Use httpsAgent instead of proxy config for proper HTTPS tunneling
      ...(httpsAgent && { httpsAgent, proxy: false }),
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
        ...additionalHeaders,
      },
      timeout: 30000, // 30 seconds timeout
      validateStatus: (status) => status >= 200 && status < 400,
    };

    return this.executeWithRetry(url, requestConfig, sessionId);
  }

  /**
   * Executes request with retry logic and exponential backoff
   * Falls back to direct request (no proxy) if proxy connection fails
   * @param url - URL being requested
   * @param config - Axios request configuration
   * @param sessionId - Optional session ID for logging
   * @returns Promise resolving to Axios response
   */
  private async executeWithRetry(
    url: string,
    config: AxiosRequestConfig,
    sessionId?: string
  ): Promise<AxiosResponse> {
    let lastError: Error | null = null;
    let triedWithoutProxy = false;
    const startTime = Date.now();
    const method = config.method?.toUpperCase() || 'GET';
    const isUsingProxy = !!(config.proxy || config.httpsAgent);
    const proxyConfig = isUsingProxy ? this.proxyManager.getProxyConfig() : null;
    const proxyHost = proxyConfig ? `${proxyConfig.host}:${proxyConfig.port}` : undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        this.logger.debug('Making HTTP request', {
          url,
          attempt: attempt + 1,
          maxRetries: this.config.maxRetries,
          usingProxy: isUsingProxy,
          sessionId: sessionId || 'none',
        });

        const response = await axios(config);
        const responseTimeMs = Date.now() - startTime;
        this.lastRequestTime = Date.now();

        // Check for 400 errors (GraphQL errors)
        if (response.status === 400) {
          const errorData = response.data;
          this.logger.error('400 Bad Request - GraphQL error', {
            url,
            responseData: typeof errorData === 'string' 
              ? errorData.substring(0, 500) 
              : JSON.stringify(errorData).substring(0, 500),
          });
          // Throw error with GraphQL error details
          throw new Error(`GraphQL Error: ${JSON.stringify(errorData)}`);
        }

        if (response.status >= 200 && response.status < 400) {
          this.logger.debug('Request successful', {
            url,
            status: response.status,
            attempt: attempt + 1,
            usedProxy: isUsingProxy,
            sessionId: sessionId || 'none',
          });

          // Log successful request to activity logger
          if (this.activityLogger && this.source) {
            this.activityLogger.logHttpRequest(
              this.source,
              url,
              method,
              response.status,
              responseTimeMs,
              isUsingProxy,
              proxyHost
            );
          }

          // Record proxy request if proxy was used
          if (isUsingProxy && proxyConfig) {
            this.proxyManager.recordProxyRequest(true, responseTimeMs);
          }

          return response;
        }

        // Include response body in error for GraphQL errors
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        if (response.data) {
          try {
            const errorData = typeof response.data === 'string' 
              ? response.data 
              : JSON.stringify(response.data);
            // Include error details (limit to 1000 chars to avoid huge errors)
            const truncatedError = errorData.length > 1000 
              ? errorData.substring(0, 1000) + '...' 
              : errorData;
            errorMessage += ` - ${truncatedError}`;
          } catch {
            // Ignore JSON stringify errors
          }
        }
        throw new Error(errorMessage);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if error is proxy-related (ENOTFOUND, ECONNREFUSED, etc.)
        const isProxyError = 
          lastError.message.includes('ENOTFOUND') ||
          lastError.message.includes('ECONNREFUSED') ||
          lastError.message.includes('ETIMEDOUT') ||
          lastError.message.includes('proxy') ||
          lastError.message.includes('Proxy') ||
          lastError.message.includes('CONNECT response') ||
          lastError.message.includes('connection ended') ||
          lastError.message.includes('socket hang up') ||
          (config.httpsAgent && lastError.message.includes('connection'));

        // If proxy error and we haven't tried without proxy yet, retry without proxy
        // Also check if httpsAgent is set (which means we're using proxy)
        if (isProxyError && isUsingProxy && !triedWithoutProxy) {
          this.logger.warn('Proxy connection failed, retrying without proxy', {
            url,
            error: lastError.message,
          });
          
          // Remove proxy and httpsAgent from config and retry immediately
          const configWithoutProxy = { ...config };
          delete configWithoutProxy.proxy;
          delete configWithoutProxy.httpsAgent;
          config.proxy = undefined;
          config.httpsAgent = undefined;
          triedWithoutProxy = true;
          
          // Don't count this as an attempt, retry immediately
          continue;
        }

        if (attempt < this.config.maxRetries) {
          // If we got 403 (blocked), wait longer before retrying
          const isBlocked = lastError.message.includes('403') || lastError.message.includes('Forbidden');
          const baseDelay = isBlocked ? this.config.retryDelayMs * 3 : this.config.retryDelayMs;
          const delay = baseDelay * Math.pow(2, attempt);
          
          this.logger.warn('Request failed, retrying', {
            url,
            attempt: attempt + 1,
            error: lastError.message,
            delayMs: delay,
            usingProxy: isUsingProxy,
            isBlocked,
            sessionId: sessionId || 'none',
          });

          await this.sleep(delay);
        } else {
          // Log failed request to activity logger
          const responseTimeMs = Date.now() - startTime;
          if (this.activityLogger && this.source) {
            this.activityLogger.logHttpRequest(
              this.source,
              url,
              method,
              0,
              responseTimeMs,
              isUsingProxy,
              proxyHost,
              lastError.message,
              attempt
            );
          }

          // Record proxy error if proxy was used
          if (isUsingProxy && proxyConfig) {
            this.proxyManager.recordProxyRequest(false, responseTimeMs);
            if (isProxyError) {
              this.proxyManager.recordProxyError(lastError.message, url);
            }
          }

          this.logger.error('Request failed after all retries', {
            url,
            attempts: attempt + 1,
            error: lastError.message,
            triedWithoutProxy,
            sessionId: sessionId || 'none',
          });
        }
      }
    }

    // Log final failure
    const responseTimeMs = Date.now() - startTime;
    if (this.activityLogger && this.source) {
      this.activityLogger.logHttpRequest(
        this.source,
        url,
        method,
        0,
        responseTimeMs,
        isUsingProxy,
        proxyHost,
        lastError?.message || 'Unknown error',
        this.config.maxRetries
      );
    }

    // Record proxy error if proxy was used
    if (isUsingProxy && proxyConfig) {
      this.proxyManager.recordProxyRequest(false, responseTimeMs);
      this.proxyManager.recordProxyError(lastError?.message || 'Unknown error', url);
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

