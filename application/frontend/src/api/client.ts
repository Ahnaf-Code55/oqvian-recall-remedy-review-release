// Transport switch.
//
// With no VITE_API_BASE_URL configured, every call is answered by the local
// interface-demo service. When the environment supplies a base URL, the same
// calls go to the real routes from the service contract. Screen code never
// changes between the two.

import * as demo from './demoService';
import type {
  BackendCasesResponse,
  BackendHealthResponse,
  BackendNoticesResponse,
  BackendReceipt,
  BackendReviewRequest,
  CasesResponse,
  ExportResponse,
  HealthResponse,
  NoticesResponse,
  ReviewRequest,
  ReviewResponse,
  StoredReview,
} from './contract';

export type ServiceMode = 'interface-demo' | 'live';

export type ApiErrorKind =
  | 'invalid_input'
  | 'incomplete_identity'
  | 'unavailable_inference'
  | 'inaccessible_live_source'
  | 'unsupported_operation'
  | 'network';

export class ApiError extends Error {
  kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';
export const apiBaseUrl = rawBase.replace(/\/$/, '');
const requestedMode = (import.meta.env.VITE_SERVICE_MODE as string | undefined)?.trim().toLowerCase();
// Live same-origin mode must be selected explicitly; an empty base URL is valid
// for the protected app served directly by the private backend.
export const serviceMode: ServiceMode = requestedMode === 'live' || apiBaseUrl ? 'live' : 'interface-demo';
export const modelRevision =
  (import.meta.env.VITE_MODEL_REVISION as string | undefined)?.trim() || null;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new ApiError('network', `The review service at ${apiBaseUrl} could not be reached.`);
  }
  if (!response.ok) {
    const kind: ApiErrorKind =
      response.status === 400
        ? 'invalid_input'
        : response.status === 404
          ? 'unsupported_operation'
          : response.status === 422
            ? 'incomplete_identity'
              : response.status === 503 || response.status === 409
              ? 'unavailable_inference'
              : 'network';
    throw new ApiError(kind, `${path} returned HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function backendHealth(): Promise<BackendHealthResponse> {
  return request<BackendHealthResponse>('/api/health');
}

export async function backendNotices(): Promise<BackendNoticesResponse> {
  return request<BackendNoticesResponse>('/api/notices');
}

export async function backendCases(): Promise<BackendCasesResponse> {
  return request<BackendCasesResponse>('/api/cases');
}

export async function createBackendReview(payload: BackendReviewRequest): Promise<BackendReceipt> {
  return request<BackendReceipt>('/api/reviews', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function exportBackendReview(reviewId: string): Promise<ExportResponse> {
  let response: Response;
  try {
    response = await fetch(apiBaseUrl + '/api/reviews/' + encodeURIComponent(reviewId) + '/export');
  } catch {
    throw new ApiError('network', 'The protected review service could not be reached.');
  }
  if (!response.ok) {
    throw new ApiError('unsupported_operation', `Export returned HTTP ${response.status}.`);
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return {
    filename: match?.[1] ?? `oqvian-review-${reviewId}.json`,
    json: await response.text(),
  };
}

export async function health(): Promise<HealthResponse> {
  if (serviceMode === 'live') return request<HealthResponse>('/api/health');
  return demo.health();
}

export async function notices(query = ''): Promise<NoticesResponse> {
  if (serviceMode === 'live') {
    return request<NoticesResponse>(`/api/notices?q=${encodeURIComponent(query)}`);
  }
  return demo.notices(query);
}

export async function cases(): Promise<CasesResponse> {
  if (serviceMode === 'live') return request<CasesResponse>('/api/cases');
  return demo.cases();
}

export async function createReview(payload: ReviewRequest): Promise<ReviewResponse> {
  if (serviceMode === 'live') {
    return request<ReviewResponse>('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
  return demo.createReview(payload);
}

export async function getReview(reviewId: string): Promise<StoredReview | null> {
  if (serviceMode === 'live') {
    try {
      return await request<StoredReview>(`/api/reviews/${reviewId}`);
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'unsupported_operation') return null;
      throw error;
    }
  }
  return demo.getReview(reviewId);
}

export function listLocalReviews(): StoredReview[] {
  return demo.listReviews();
}

export async function exportReview(reviewId: string): Promise<ExportResponse> {
  if (serviceMode === 'live') {
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/api/reviews/${reviewId}/export`);
    } catch {
      throw new ApiError('network', `The review service at ${apiBaseUrl} could not be reached.`);
    }
    if (!response.ok) {
      throw new ApiError('unsupported_operation', `Export returned HTTP ${response.status}.`);
    }
    const disposition = response.headers.get('content-disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    return {
      filename: match?.[1] ?? `oqvian-receipt-${reviewId}.json`,
      json: await response.text(),
    };
  }
  return demo.exportReview(reviewId);
}

export function clearLocalReviews(): void {
  demo.clearReviews();
}
