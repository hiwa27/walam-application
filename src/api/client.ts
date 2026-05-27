import Constants from 'expo-constants';

export type ApiResult<T> = T & { success: boolean; error?: string };

const DEFAULT_BASE_URL = (Constants.expoConfig?.extra?.apiBaseUrl as string) || 'https://walam.app/mobile-api.php';

export class ApiClient {
  constructor(private baseUrl: string = DEFAULT_BASE_URL, private token: string | null = null) {}

  setToken(token: string | null) {
    this.token = token;
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  getToken() {
    return this.token;
  }

  async request<T>(action: string, body: Record<string, unknown> = {}): Promise<ApiResult<T>> {
    const controller = new AbortController();
    const timeoutMs = typeof body.timeout_ms === 'number' ? Number(body.timeout_ms) : 15000;
    const timer = setTimeout(() => controller.abort(), Math.max(3000, timeoutMs));
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
        },
        body: JSON.stringify({ action, ...body }),
        signal: controller.signal,
      });
      const json = (await response.json()) as ApiResult<T>;
      if (!response.ok || !json.success) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }
      return json;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('request_timeout');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const api = new ApiClient();
