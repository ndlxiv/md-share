// Thin client for the share API used by the editor.

export type SharePayload = {
  files: { filename: string; content: string }[];
  expiration: string;
  passwordProtected: boolean;
  password: string;
};

export type CreatedShare = {
  url: string;
  editCode: string;
  editUrl: string;
  share: { id: string; title: string; files: { filename: string; slug: string; url: string }[] };
};

export type EditableShare = {
  id: string;
  title: string;
  files: { filename: string; content: string }[];
  created_at: string;
  updated_at: string | null;
  expires_at: string | null;
  passwordProtected: boolean;
};

export class ApiError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError("network_error", 0);
  }
  if (response.status === 204) return null as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error || "request_failed", response.status);
  return payload as T;
}

const jsonInit = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const sharePath = (id: string) => `/api/shares/${encodeURIComponent(id)}`;

export const createShare = (payload: SharePayload) => request<CreatedShare>("/api/shares", jsonInit("POST", payload));

export const getShare = (id: string, editCode: string) =>
  request<{ share: EditableShare }>(sharePath(id), { headers: { "x-edit-code": editCode } });

export const updateShare = (id: string, editCode: string, payload: SharePayload) =>
  request<{ share: EditableShare; url: string }>(sharePath(id), jsonInit("PUT", payload, { "x-edit-code": editCode }));

export const deleteShare = (id: string, editCode: string) =>
  request<null>(sharePath(id), { method: "DELETE", headers: { "x-edit-code": editCode } });

const MESSAGES: Record<string, string> = {
  content_required: "Add some Markdown before sharing.",
  content_too_large: "This share is too large. Each file can hold up to 100,000 characters and the whole share up to 1 MB.",
  too_many_files: "A share can contain up to 20 files.",
  password_required: "Enter a password or turn off password protection.",
  invalid_json: "The request could not be read. Please try again.",
  invalid_edit_code: "That edit code doesn't match this share.",
  edit_code_required: "Enter the edit code for this share.",
  not_editable: "This share was created before editing was available, so it can't be edited.",
  not_found: "This share doesn't exist or has been deleted.",
  expired: "This share has expired and can no longer be edited.",
  network_error: "Network error. Check your connection and try again.",
};

export function errorMessage(error: unknown) {
  const code = error instanceof ApiError ? error.code : "";
  return MESSAGES[code] || "Something went wrong. Please try again.";
}
