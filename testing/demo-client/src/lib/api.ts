const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function handleError(res: Response, fallback: string) {
  const errorData = await res.json().catch(() => ({ message: fallback }));
  let msg = errorData.message || `HTTP ${res.status}`;
  if (errorData.errors && Array.isArray(errorData.errors)) {
    const details = errorData.errors.map((e: any) => e.message).join(" • ");
    if (details) msg += `, ${details}`;
  }
  throw new Error(msg);
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, headers, ...rest } = options;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    credentials: "include", // Send httpOnly cookies automatically
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  });

  if (!res.ok) {
    await handleError(res, "Request failed");
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

// Multipart upload (for image uploads — don't set Content-Type, browser sets boundary)
async function upload<T>(endpoint: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    credentials: "include",
    body: formData,
    // No Content-Type header — browser sets multipart/form-data with boundary automatically
  });

  if (!res.ok) {
    await handleError(res, "Upload failed");
  }

  return res.json();
}

async function uploadPatch<T>(endpoint: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "PATCH",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    await handleError(res, "Update failed");
  }

  return res.json();
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: "GET" }),
  post: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, { method: "POST", body }),
  patch: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, { method: "PATCH", body }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: "DELETE" }),
  upload: <T>(endpoint: string, formData: FormData) => upload<T>(endpoint, formData),
  uploadPatch: <T>(endpoint: string, formData: FormData) => uploadPatch<T>(endpoint, formData),
};
