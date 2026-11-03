import {
  DEFAULT_SUPERSET_URL,
  MAX_RESPONSE_BYTES,
  readConfigFile,
} from './config.mjs';
import {
  listFields,
  numberFromEnv,
  risonValue,
  tokenSubject,
  unwrap,
} from './utils.mjs';

export class SupersetApiError extends Error {
  constructor(status, path) {
    super(`Superset returned HTTP ${status} for ${path}`);
    this.name = 'SupersetApiError';
    this.status = status;
  }
}

export class SupersetClient {
  constructor() {
    this.loginPromise = null;
    this.loadConfig();
  }

  loadConfig() {
    const fileConfig = readConfigFile();
    this.baseUrl = (
      process.env.SUPERSET_URL ||
      fileConfig.SUPERSET_URL ||
      fileConfig.superset_url ||
      DEFAULT_SUPERSET_URL
    ).replace(/\/+$/, '');

    this.apiToken = (
      process.env.SUPERSET_API_TOKEN ||
      fileConfig.SUPERSET_API_TOKEN ||
      fileConfig.api_token ||
      ''
    ).trim() || null;

    this.username = (
      process.env.SUPERSET_USERNAME ||
      fileConfig.SUPERSET_USERNAME ||
      fileConfig.username ||
      ''
    ).trim() || null;

    this.password = (
      process.env.SUPERSET_PASSWORD ||
      fileConfig.SUPERSET_PASSWORD ||
      fileConfig.password ||
      ''
    ) || null;

    this.provider = (
      process.env.SUPERSET_PROVIDER ||
      fileConfig.SUPERSET_PROVIDER ||
      fileConfig.provider ||
      'db'
    );

    this.timeoutMs = numberFromEnv(
      'SUPERSET_REQUEST_TIMEOUT_MS',
      fileConfig.SUPERSET_REQUEST_TIMEOUT_MS ?? 20_000,
      1_000,
      120_000
    );
    this.maxPageSize = numberFromEnv(
      'SUPERSET_MAX_PAGE_SIZE',
      fileConfig.SUPERSET_MAX_PAGE_SIZE ?? 100,
      1,
      200
    );
    this.maxOutputRows = numberFromEnv(
      'SUPERSET_MAX_OUTPUT_ROWS',
      fileConfig.SUPERSET_MAX_OUTPUT_ROWS ?? 200,
      1,
      1_000
    );
    this.accessToken = null;
    this.currentUserId = null;
    this.csrfToken = null;
    this.csrfCookie = null;
  }

  async getCsrfToken(forceRefresh = false) {
    if (!forceRefresh && this.csrfToken && this.csrfCookie) {
      return { token: this.csrfToken, cookie: this.csrfCookie };
    }
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/api/v1/security/csrf_token/`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) return null;
    const data = await response.json();
    this.csrfToken = data?.result || null;
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      this.csrfCookie = setCookie.split(';')[0];
    }
    return { token: this.csrfToken, cookie: this.csrfCookie };
  }

  async getAccessToken() {
    if (this.apiToken) return this.apiToken;
    if (this.accessToken) return this.accessToken;
    if (!this.loginPromise) {
      this.loginPromise = this.login();
    }
    try {
      return await this.loginPromise;
    } finally {
      this.loginPromise = null;
    }
  }

  async getCredentials() {
    if (this.username && this.password) {
      return { username: this.username, password: this.password };
    }
    this.loadConfig();
    if (this.username && this.password) {
      return { username: this.username, password: this.password };
    }
    throw new Error(
      'Superset credentials (username/password) are not configured. ' +
      'Please ask the user for their Superset username and password, then call the "configure_credentials" tool to save them.'
    );
  }

  async login() {
    const path = '/api/v1/security/login';
    const credentials = await this.getCredentials();
    const sendLogin = async (creds) => fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: creds.username,
        password: creds.password,
        provider: this.provider,
        refresh: true,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const response = await sendLogin(credentials);

    if (response.status === 401) {
      throw new Error(
        'Superset authentication failed (401 Unauthorized): Invalid username or password. ' +
        'Please verify credentials with the user and update them using the "configure_credentials" tool.'
      );
    }

    if (!response.ok) throw new SupersetApiError(response.status, path);
    const data = await response.json();
    if (typeof data?.access_token !== 'string' || !data.access_token) {
      throw new Error('Superset login response did not contain an access token.');
    }
    this.accessToken = data.access_token;
    this.currentUserId = tokenSubject(data.access_token);
    return this.accessToken;
  }

  async request(path, { method = 'GET', query, body } = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }

    const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
    let csrf = isMutating ? await this.getCsrfToken() : null;

    const send = async (token) => {
      const headers = {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (isMutating) {
        headers['Referer'] = `${this.baseUrl}/`;
        if (csrf?.token) headers['X-CSRFToken'] = csrf.token;
        if (csrf?.cookie) headers['Cookie'] = csrf.cookie;
      }
      return fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    };

    let token = await this.getAccessToken();
    let response = await send(token);

    if (response.status === 401 && !this.apiToken) {
      this.accessToken = null;
      token = await this.getAccessToken();
      response = await send(token);
    } else if (response.status === 400 && isMutating) {
      // Retry once if CSRF token was stale
      csrf = await this.getCsrfToken(true);
      response = await send(token);
    }

    if (!response.ok) throw new SupersetApiError(response.status, path);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_RESPONSE_BYTES) {
      throw new Error('Superset response exceeded the configured response-size guard.');
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new Error('Superset response exceeded the configured response-size guard.');
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error('Superset returned a non-JSON response.');
    }
  }

  async list(resource, page, pageSize, searchColumn, search) {
    const size = Math.min(pageSize, this.maxPageSize);
    const filter = search?.trim()
      ? `filters:!((col:${searchColumn},opr:ct,value:${risonValue(search.trim())})),`
      : '';
    const q = `(${filter}page:${page},page_size:${size})`;
    const response = await this.request(`/api/v1/${resource}/`, { query: { q } });
    const result = listFields(unwrap(response));
    return { count: Number(response?.count ?? result.length), result, page, page_size: size };
  }
}
