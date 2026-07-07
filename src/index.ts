import type { paths } from "./types";

type ApproveBody =
  paths["/jobs/{id}/approve-unified"]["post"]["requestBody"] extends {
    content: { "application/json": infer B };
  }
    ? B
    : undefined;

type ConfirmBody = paths["/jobs/{id}/confirm"]["post"]["requestBody"] extends {
  content: { "application/json": infer B };
}
  ? B
  : undefined;

export type ClientConfig = {
  baseUrl: string;
  getToken?: () => Promise<string> | string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

export type RequestOptions = {
  idempotencyKey?: string;
};

export class ConvertriloApiError extends Error {
  status: number;
  statusText: string;
  body: string;

  constructor(status: number, statusText: string, body: string) {
    super(`HTTP ${status} ${statusText}: ${body}`);
    this.name = "ConvertriloApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

export class ConvertriloClient {
  private baseUrl: string;
  private getToken?: () => Promise<string> | string;
  private apiKey?: string;
  private fetchImpl: typeof fetch;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.getToken = config.getToken;
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl || fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(init.headers as any),
    };

    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    } else if (this.getToken) {
      const token = await this.getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    const hasBody = init.body !== undefined;
    if (hasBody && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ConvertriloApiError(res.status, res.statusText, text);
    }
    if (res.status === 204) return undefined as any;
    return (await res.json()) as T;
  }

  // Auth
  async login(
    body: paths["/auth/login"]["post"]["requestBody"]["content"]["application/json"]
  ): Promise<
    paths["/auth/login"]["post"]["responses"]["200"]["content"]["application/json"]
  > {
    return this.request(`/auth/login`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: "" }, // no auth
    });
  }

  // Tokens
  async getBalance() {
    return this.request<
      paths["/tokens/balance"]["get"]["responses"]["200"]["content"]["application/json"]
    >(`/tokens/balance`);
  }
  async reserveTokens(
    body: paths["/tokens/reserve"]["post"]["requestBody"]["content"]["application/json"]
  ) {
    return this.request(`/tokens/reserve`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  async releaseTokens(
    body: paths["/tokens/release"]["post"]["requestBody"]["content"]["application/json"]
  ) {
    return this.request(`/tokens/release`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  async deductTokens(
    body: paths["/tokens/deduct"]["post"]["requestBody"]["content"]["application/json"]
  ) {
    return this.request(`/tokens/deduct`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // Jobs
  async createJob(
    body: paths["/jobs"]["post"]["requestBody"]["content"]["application/json"],
    options: RequestOptions = {}
  ) {
    return this.request<
      paths["/jobs"]["post"]["responses"]["200"]["content"]["application/json"]
    >(`/jobs`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : undefined,
    });
  }
  async probeDuration(id: string) {
    return this.request<
      paths["/jobs/{id}/probe-duration"]["get"]["responses"]["200"]["content"]["application/json"]
    >(`/jobs/${id}/probe-duration`);
  }
  async approveUnified(id: string, body?: ApproveBody) {
    return this.request<
      paths["/jobs/{id}/approve-unified"]["post"]["responses"]["200"]["content"]["application/json"]
    >(`/jobs/${id}/approve-unified`, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async confirmJob(id: string, body?: ConfirmBody) {
    return this.request<
      paths["/jobs/{id}/confirm"]["post"]["responses"]["200"]["content"]["application/json"]
    >(`/jobs/${id}/confirm`, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async cancelJob(id: string) {
    return this.request(`/jobs/${id}/cancel`, { method: "POST" });
  }
  async jobStatus(id: string) {
    return this.request<
      paths["/jobs/{id}/status"]["get"]["responses"]["200"]["content"]["application/json"]
    >(`/jobs/${id}/status`);
  }

  // Bulk Jobs
  async createJobsBulk(
    body: paths["/jobs/bulk"]["post"]["requestBody"]["content"]["application/json"],
    options: RequestOptions = {}
  ) {
    return this.request<
      paths["/jobs/bulk"]["post"]["responses"]["200"]["content"]["application/json"]
    >(`/jobs/bulk`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : undefined,
    });
  }
  async bulkStatus(ids: string[]) {
    return this.request<
      paths["/jobs/bulk/status"]["get"]["responses"]["200"]["content"]["application/json"]
    >(`/jobs/bulk/status?ids=${ids.join(",")}`);
  }
  async bulkConfirm(
    body: paths["/jobs/bulk/confirm"]["post"]["requestBody"]["content"]["application/json"]
  ) {
    return this.request<
      paths["/jobs/bulk/confirm"]["post"]["responses"]["200"]["content"]["application/json"]
    >(`/jobs/bulk/confirm`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // API Keys
  async getApiKeys() {
    return this.request<
      paths["/api-keys"]["get"]["responses"]["200"]["content"]["application/json"]
    >(`/api-keys`);
  }
  async createApiKey(
    body: paths["/api-keys"]["post"]["requestBody"]["content"]["application/json"]
  ) {
    return this.request<
      paths["/api-keys"]["post"]["responses"]["200"]["content"]["application/json"]
    >(`/api-keys`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  async revokeApiKey(id: string) {
    return this.request(`/api-keys/${id}`, { method: "DELETE" });
  }

  // Webhooks
  async getWebhooks() {
    return this.request<
      paths["/webhooks"]["get"]["responses"]["200"]["content"]["application/json"]
    >(`/webhooks`);
  }
  async createWebhook(
    body: paths["/webhooks"]["post"]["requestBody"]["content"]["application/json"]
  ) {
    return this.request<
      paths["/webhooks"]["post"]["responses"]["200"]["content"]["application/json"]
    >(`/webhooks`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  async updateWebhook(
    id: string,
    body: paths["/webhooks/{id}"]["patch"]["requestBody"]["content"]["application/json"]
  ) {
    return this.request<
      paths["/webhooks/{id}"]["patch"]["responses"]["200"]["content"]["application/json"]
    >(`/webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }
  async deleteWebhook(id: string) {
    return this.request(`/webhooks/${id}`, { method: "DELETE" });
  }
  async testWebhook(id: string) {
    return this.request(`/webhooks/${id}/test`, { method: "POST" });
  }
  async getWebhookDeliveries(id: string) {
    return this.request<
      paths["/webhooks/{id}/deliveries"]["get"]["responses"]["200"]["content"]["application/json"]
    >(`/webhooks/${id}/deliveries`);
  }

  // Streaming
  async initStream(id: string) {
    return this.request<
      paths["/jobs/{id}/stream/init"]["post"]["responses"]["200"]["content"]["application/json"]
    >(`/jobs/${id}/stream/init`, { method: "POST" });
  }
  async uploadChunk(
    id: string,
    index: number,
    data: Buffer | Blob | ArrayBuffer
  ) {
    return this.request(`/jobs/${id}/stream/chunk/${index}`, {
      method: "PUT",
      body: data as any,
      headers: { "Content-Type": "application/octet-stream" },
    });
  }
  async finalizeStream(
    id: string,
    body?: paths["/jobs/{id}/stream/finalize"]["post"]["requestBody"] extends {
      content: { "application/json": infer B };
    }
      ? B
      : any
  ) {
    return this.request(`/jobs/${id}/stream/finalize`, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async abortStream(id: string) {
    return this.request(`/jobs/${id}/stream/abort`, { method: "POST" });
  }

  // On-Demand Encoding
  async getGoogleDriveCredentials() {
    return this.request<
      paths["/ondemand/credentials/google-drive"]["get"]["responses"]["200"]["content"]["application/json"]
    >(`/ondemand/credentials/google-drive`);
  }

  async createGoogleDriveCredential(
    body: paths["/ondemand/credentials/google-drive"]["post"]["requestBody"]["content"]["application/json"]
  ) {
    return this.request<
      paths["/ondemand/credentials/google-drive"]["post"]["responses"]["201"]["content"]["application/json"]
    >(`/ondemand/credentials/google-drive`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteGoogleDriveCredential(id: string) {
    return this.request(`/ondemand/credentials/google-drive/${id}`, {
      method: "DELETE",
    });
  }

  async onDemandEncode(
    body: paths["/ondemand/encode"]["post"]["requestBody"]["content"]["application/json"],
    options: RequestOptions = {}
  ) {
    return this.request<
      paths["/ondemand/encode"]["post"]["responses"]["200"]["content"]["application/json"]
    >(`/ondemand/encode`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : undefined,
    });
  }

  async onDemandIngestFolder(
    body: paths["/ondemand/ingest/folder"]["post"]["requestBody"]["content"]["application/json"],
    options: RequestOptions = {}
  ) {
    return this.request<
      paths["/ondemand/ingest/folder"]["post"]["responses"]["200"]["content"]["application/json"]
    >(`/ondemand/ingest/folder`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : undefined,
    });
  }

  async onDemandStatus(jobId: string) {
    return this.request<
      paths["/ondemand/status/{jobId}"]["get"]["responses"]["200"]["content"]["application/json"]
    >(`/ondemand/status/${jobId}`);
  }

  async onDemandCancel(jobId: string) {
    return this.request<{
      ok: boolean;
      released: number;
    }>(`/ondemand/${jobId}`, { method: "DELETE" });
  }

  /**
   * Helper method to encode a video and wait for completion
   * @param sourceUrl - URL to the video file
   * @param options - Encoding options
   * @param pollInterval - Polling interval in milliseconds (default: 5000)
   * @param maxAttempts - Maximum polling attempts (default: 120)
   * @returns Download URL when encoding is complete
   */
  async onDemandEncodeAndWait(
    sourceUrl: string,
    options: {
      codec?: "h264" | "h265" | "av1";
      resolution?: "480p" | "720p" | "1080p" | "1440p" | "2160p";
      fps?: number;
      quality?: "good" | "better" | "best";
      priority?: "normal" | "high";
      outputExpiry?: number;
    } = {},
    pollInterval: number = 5000,
    maxAttempts: number = 120
  ): Promise<string> {
    // Submit for encoding
    const job = await this.onDemandEncode({
      sourceUrl,
      ...options,
    });

    // Poll for completion
    let attempts = 0;
    while (attempts < maxAttempts) {
      const status = await this.onDemandStatus(job.jobId);

      if (status.status === "success" && status.downloadUrl) {
        return status.downloadUrl;
      }

      if (status.status === "failed") {
        throw new Error(status.failureMessage || "Encoding failed");
      }

      if (status.status === "canceled") {
        throw new Error("Job was canceled");
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      attempts++;
    }

    throw new Error("Polling timeout: job did not complete in time");
  }
}
