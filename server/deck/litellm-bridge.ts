/**
 * LiteLLM Bridge
 *
 * Configuration and health checking for LiteLLM proxy integration.
 */

export interface LiteLLMConfig {
  enabled: boolean;
  proxyUrl: string;
}

const DEFAULT_PROXY_URL = "http://localhost:4000";

export class LiteLLMBridge {
  private config: LiteLLMConfig;
  private available = false;

  constructor() {
    this.config = {
      enabled: !!process.env.LITELLM_PROXY_URL,
      proxyUrl: process.env.LITELLM_PROXY_URL || DEFAULT_PROXY_URL,
    };
  }

  /** Check if the LiteLLM proxy is reachable */
  async checkAvailability(): Promise<boolean> {
    if (!this.config.enabled) {
      this.available = false;
      return false;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${this.config.proxyUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      this.available = res.ok;
      return this.available;
    } catch {
      this.available = false;
      return false;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  getProxyUrl(): string {
    return this.config.proxyUrl;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** Get env overrides for Claude adapter passthrough */
  getEnvOverrides(): Record<string, string> {
    if (!this.available) return {};
    return {
      ANTHROPIC_BASE_URL: this.config.proxyUrl,
    };
  }
}
