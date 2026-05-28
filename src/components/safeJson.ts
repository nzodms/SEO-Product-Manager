// Reads a fetch Response without ever throwing on empty / non-JSON bodies.
// Prevents "Unexpected end of JSON input" from crashing the UI.

export interface SafeJson<T = any> {
  ok: boolean; // HTTP ok AND body parsed AND no { error } in payload
  status: number;
  data: T | null;
  error: string | null;
}

export async function safeReadJson<T = any>(res: Response): Promise<SafeJson<T>> {
  const contentType = res.headers.get("content-type") || "";
  let text = "";
  try {
    text = await res.text();
  } catch {
    text = "";
  }

  // Empty body.
  if (!text.trim()) {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: `Réponse vide du serveur (HTTP ${res.status}).`,
    };
  }

  // Non-JSON body (HTML error page, plain text, …).
  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: `Réponse non-JSON (HTTP ${res.status}) : ${text.slice(0, 300)}`,
    };
  }

  // JSON body.
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: `JSON invalide (HTTP ${res.status}) : ${text.slice(0, 300)}`,
    };
  }

  const payloadError =
    data && data.error != null
      ? typeof data.error === "string"
        ? data.error
        : JSON.stringify(data.error)
      : null;

  return {
    ok: res.ok && !payloadError,
    status: res.status,
    data: data as T,
    error: payloadError ?? (res.ok ? null : `HTTP ${res.status}`),
  };
}
