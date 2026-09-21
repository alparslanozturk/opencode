/**
 * Turns *known* defects (unhandled throws / `Effect.die`) into a typed, short,
 * safe reason so the client gets something actionable instead of a blanket
 * "Unexpected server error".
 *
 * Rules:
 *  - Allowlist only. Anything not recognized returns `undefined` and keeps the
 *    generic 500 body — we never echo arbitrary defect messages or stacks to a
 *    client (see `test/server/httpapi-error-middleware.test.ts`).
 *  - Messages are composed from *structured* fields of recognized error shapes,
 *    never from a raw stack. Provider-supplied text is truncated.
 *  - URLs are reduced to their origin so credentials in a query string or path
 *    can never end up in a response body.
 *  - Duck-typed on `_tag` / `name` on purpose: keeps this module dependency-free
 *    (no import cycle with provider/llm) and trivially unit testable.
 */

const MAX_REASON = 300
const MAX_BODY = 200

export interface DefectClassification {
  /** HTTP status for the response. */
  readonly status: number
  /** Error name placed in the response body (`{ name, data: { message, ref } }`). */
  readonly name: string
  /** Short, safe, human readable reason. */
  readonly message: string
  /** Upstream HTTP status when the failure came from the provider endpoint. */
  readonly upstream?: number
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null
}

function str(input: unknown): string | undefined {
  return typeof input === "string" && input.length > 0 ? input : undefined
}

function num(input: unknown): number | undefined {
  return typeof input === "number" && Number.isFinite(input) ? input : undefined
}

function truncate(input: unknown, limit = MAX_REASON): string | undefined {
  const text = str(input)?.replace(/\s+/g, " ").trim()
  if (!text) return undefined
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

/** `https://host:8000/v1/chat/completions?api-key=x` -> `https://host:8000` */
function origin(input: unknown): string | undefined {
  const text = str(input)
  if (!text) return undefined
  try {
    return new URL(text).origin
  } catch {
    return undefined
  }
}

function tagOf(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined
  return str(error["_tag"]) ?? str(error["name"])
}

function suffix(reason: string | undefined) {
  return reason ? `: ${reason}` : ""
}

const TIMEOUT_CODES = new Set([
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
])

const CONNECT_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "EPROTO",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
  "UND_ERR_SOCKET",
])

const TLS_CODE = /^(CERT_|DEPTH_ZERO_|SELF_SIGNED_|UNABLE_TO_|ERR_TLS_)/

/** Network-level failure: DNS, TCP, TLS, timeout. Looks at `error.cause` too (undici wraps). */
function classifyNetwork(error: unknown): DefectClassification | undefined {
  if (!isRecord(error)) return undefined
  const cause = isRecord(error["cause"]) ? error["cause"] : undefined
  const code = str(error["code"]) ?? str(cause?.["code"])
  const host = str(error["hostname"]) ?? str(cause?.["hostname"])
  const where = host ? ` (${host})` : ""

  if (code && TIMEOUT_CODES.has(code))
    return {
      status: 504,
      name: "ProviderTimeoutError",
      message: `Provider endpoint timed out${where}: ${code}`,
    }

  if (code && TLS_CODE.test(code))
    return {
      status: 502,
      name: "ProviderConnectionError",
      message: `TLS handshake with the provider endpoint failed${where}: ${code}`,
    }

  if (code && CONNECT_CODES.has(code))
    return {
      status: 502,
      name: "ProviderConnectionError",
      message: `Cannot reach the provider endpoint${where}: ${code}`,
    }

  // undici surfaces every low level failure as `TypeError: fetch failed`
  if (str(error["message"]) === "fetch failed")
    return {
      status: 502,
      name: "ProviderConnectionError",
      message: `Cannot reach the provider endpoint${where}: fetch failed${suffix(truncate(cause?.["message"], 120))}`,
    }

  return undefined
}

/** `LLMError` from @opencode-ai/llm — already classified by the provider layer. */
function classifyLLMError(error: Record<string, unknown>): DefectClassification | undefined {
  const reason = isRecord(error["reason"]) ? error["reason"] : undefined
  if (!reason) return undefined
  const tag = str(reason["_tag"])
  const message = truncate(reason["message"])
  const http = isRecord(reason["http"]) ? reason["http"] : undefined
  const response = isRecord(http?.["response"]) ? http["response"] : undefined
  const upstream = num(response?.["status"])
  const named = (status: number, name: string, text: string): DefectClassification => ({
    status,
    name,
    message: text,
    ...(upstream !== undefined ? { upstream } : {}),
  })

  switch (tag) {
    case "Authentication":
      return named(
        401,
        "ProviderAuthError",
        `Provider rejected the credentials (${str(reason["kind"]) ?? "unknown"})${suffix(message)}`,
      )
    case "RateLimit":
      return named(429, "ProviderRateLimitError", `Provider rate limit hit${suffix(message)}`)
    case "QuotaExceeded":
      return named(429, "ProviderQuotaError", `Provider quota exceeded${suffix(message)}`)
    case "ContentPolicy":
      return named(400, "ProviderContentPolicyError", `Provider content policy rejected the request${suffix(message)}`)
    case "InvalidRequest": {
      const classification = str(reason["classification"])
      const parameter = str(reason["parameter"])
      const detail = [classification, parameter && `parameter: ${parameter}`].filter(Boolean).join(", ")
      return named(
        400,
        "ProviderInvalidRequestError",
        `Provider rejected the request${detail ? ` (${detail})` : ""}${suffix(message)}`,
      )
    }
    case "ProviderInternal":
      return named(
        502,
        "ProviderUpstreamError",
        `Provider returned an internal error (HTTP ${num(reason["status"]) ?? upstream ?? "?"})${suffix(message)}`,
      )
    case "Transport": {
      const kind = str(reason["kind"])
      const url = origin(reason["url"])
      const timeout = /timed?\s?out|timeout/i.test(str(reason["message"]) ?? "") || kind === "timeout"
      return named(
        timeout ? 504 : 502,
        timeout ? "ProviderTimeoutError" : "ProviderConnectionError",
        `Provider connection failed${kind ? ` (${kind})` : ""}${url ? ` to ${url}` : ""}${suffix(message)}`,
      )
    }
    case "InvalidProviderOutput":
      return named(
        502,
        "ProviderInvalidOutputError",
        `Provider returned a malformed response — the endpoint is likely not OpenAI compatible${suffix(message)}`,
      )
    case "NoRoute":
      return named(
        404,
        "ProviderNoRouteError",
        `No LLM route for ${str(reason["provider"]) ?? "?"}/${str(reason["model"]) ?? "?"}`,
      )
    case "UnknownProvider":
      return named(
        502,
        "ProviderUpstreamError",
        `Provider failed (HTTP ${num(reason["status"]) ?? upstream ?? "?"})${suffix(message)}`,
      )
    default:
      return undefined
  }
}

/** Vercel AI SDK errors (`@ai-sdk/provider`), duck-typed by their `AI_*` name. */
function classifyAiSdk(error: Record<string, unknown>, name: string): DefectClassification | undefined {
  if (name === "AI_APICallError" || name === "APICallError") {
    const upstream = num(error["statusCode"])
    const url = origin(error["url"])
    const body = truncate(error["responseBody"], MAX_BODY)
    const status =
      upstream === 401 || upstream === 403
        ? 401
        : upstream === 429
          ? 429
          : upstream !== undefined && upstream >= 400 && upstream < 500
            ? 400
            : 502
    return {
      status,
      name: "ProviderUpstreamError",
      message: `Provider returned HTTP ${upstream ?? "?"}${url ? ` from ${url}` : ""}${suffix(body ?? truncate(error["message"], MAX_BODY))}`,
      ...(upstream !== undefined ? { upstream } : {}),
    }
  }

  if (name === "AI_LoadAPIKeyError" || name === "LoadAPIKeyError")
    return {
      status: 401,
      name: "ProviderAuthError",
      message: `Provider API key is missing or unreadable${suffix(truncate(error["message"], MAX_BODY))}`,
    }

  if (name === "AI_NoSuchModelError" || name === "NoSuchModelError")
    return {
      status: 404,
      name: "ProviderModelNotFoundError",
      message: `Model not found at the provider: ${str(error["modelId"]) ?? "?"}`,
    }

  if (
    name === "AI_JSONParseError" ||
    name === "AI_TypeValidationError" ||
    name === "AI_NoObjectGeneratedError" ||
    name === "AI_InvalidResponseDataError"
  )
    return {
      status: 502,
      name: "ProviderInvalidOutputError",
      message: `Provider returned a malformed response (${name}) — the endpoint is likely not OpenAI compatible or the stream was cut`,
    }

  if (name === "AI_InvalidToolInputError" || name === "AI_NoSuchToolError")
    return {
      status: 502,
      name: "ProviderToolCallError",
      message: `Provider produced an invalid tool call (${name}) — the endpoint may not support tool calling`,
    }

  if (name.startsWith("AI_"))
    return {
      status: 502,
      name: "ProviderUpstreamError",
      message: `Provider call failed (${name})${suffix(truncate(error["message"], MAX_BODY))}`,
    }

  return undefined
}

export function classifyDefect(error: unknown, depth = 0): DefectClassification | undefined {
  if (depth > 3 || !isRecord(error)) return undefined
  const tag = tagOf(error)

  switch (tag) {
    case "ProviderModelNotFoundError": {
      const suggestions = Array.isArray(error["suggestions"])
        ? error["suggestions"].filter((item): item is string => typeof item === "string")
        : []
      return {
        status: 404,
        name: "ProviderModelNotFoundError",
        message:
          `Model not found: ${str(error["providerID"]) ?? "?"}/${str(error["modelID"]) ?? "?"}.` +
          (suggestions.length ? ` Did you mean: ${suggestions.slice(0, 5).join(", ")}?` : "") +
          " Check the model id in opencode.json against the endpoint's /models output.",
      }
    }
    case "ProviderInitError": {
      const inner = classifyDefect(error["cause"], depth + 1)
      return {
        status: 502,
        name: "ProviderInitError",
        message: `Failed to initialize provider: ${str(error["providerID"]) ?? "?"}${suffix(inner?.message)}`,
        ...(inner?.upstream !== undefined ? { upstream: inner.upstream } : {}),
      }
    }
    case "ProviderNoProvidersError":
      return {
        status: 503,
        name: "ProviderNoProvidersError",
        message: "No providers are configured — check the provider block in opencode.json.",
      }
    case "ProviderNoModelsError":
      return {
        status: 404,
        name: "ProviderNoModelsError",
        message: `No models are available for provider: ${str(error["providerID"]) ?? "?"}`,
      }
    case "ProviderAuthError": {
      // NamedError shape: { name, data: { providerID, message } }
      const data = isRecord(error["data"]) ? error["data"] : undefined
      return {
        status: 401,
        name: "ProviderAuthError",
        message: `Provider authentication failed: ${str(data?.["providerID"]) ?? "?"}${suffix(truncate(data?.["message"]))}`,
      }
    }
    case "LLM.Error": {
      const classified = classifyLLMError(error)
      if (classified) return classified
      break
    }
  }

  const network = classifyNetwork(error)
  if (network) return network

  if (tag) {
    const aiSdk = classifyAiSdk(error, tag)
    if (aiSdk) return aiSdk
  }

  // Wrapped defects: `Effect.die(new Error("...", { cause: realError }))`
  return classifyDefect(error["cause"], depth + 1)
}
