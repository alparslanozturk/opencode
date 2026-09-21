import { describe, expect, test } from "bun:test"
import {
  AuthenticationReason,
  InvalidProviderOutputReason,
  LLMError,
  ProviderInternalReason,
  TransportReason,
} from "@opencode-ai/llm"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { classifyDefect } from "../../src/server/routes/instance/httpapi/middleware/classify"
import { Provider } from "../../src/provider/provider"
import { MessageError } from "../../src/session/message-error"

describe("classifyDefect", () => {
  test("keeps unknown defects generic", () => {
    expect(classifyDefect(new Error("secret stack marker"))).toBeUndefined()
    expect(classifyDefect("boom")).toBeUndefined()
    expect(classifyDefect(undefined)).toBeUndefined()
    expect(classifyDefect({ name: "SomeRandomError", message: "secret" })).toBeUndefined()
  })

  test("model not found points at the config/endpoint mismatch", () => {
    const classified = classifyDefect(
      new Provider.ModelNotFoundError({
        providerID: ProviderV2.ID.make("kurum"),
        modelID: ModelV2.ID.make("qwen3.6-35b-a3b"),
        suggestions: ["Qwen3.6-35B-A3B-FP8"],
      }),
    )
    expect(classified?.status).toBe(404)
    expect(classified?.name).toBe("ProviderModelNotFoundError")
    expect(classified?.message).toContain("kurum/qwen3.6-35b-a3b")
    expect(classified?.message).toContain("Qwen3.6-35B-A3B-FP8")
  })

  test("provider init failure unwraps its cause", () => {
    const cause = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNREFUSED", hostname: "llm.internal" },
    })
    const classified = classifyDefect(
      new Provider.InitError({ providerID: ProviderV2.ID.make("kurum"), cause }),
    )
    expect(classified?.status).toBe(502)
    expect(classified?.name).toBe("ProviderInitError")
    expect(classified?.message).toContain("kurum")
    expect(classified?.message).toContain("ECONNREFUSED")
  })

  test("no providers configured", () => {
    expect(classifyDefect(new Provider.NoProvidersError())?.status).toBe(503)
  })

  test("provider auth NamedError", () => {
    const classified = classifyDefect(
      new MessageError.AuthError({ providerID: "kurum", message: "missing api key" }),
    )
    expect(classified?.status).toBe(401)
    expect(classified?.message).toContain("kurum")
  })

  describe("network defects", () => {
    const cases = [
      { code: "ECONNREFUSED", status: 502 },
      { code: "ENOTFOUND", status: 502 },
      { code: "ETIMEDOUT", status: 504 },
      { code: "UND_ERR_HEADERS_TIMEOUT", status: 504 },
      { code: "SELF_SIGNED_CERT_IN_CHAIN", status: 502 },
    ]
    for (const item of cases) {
      test(item.code, () => {
        const error = Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error(item.code), { code: item.code, hostname: "llm.internal" }),
        })
        const classified = classifyDefect(error)
        expect(classified?.status).toBe(item.status)
        expect(classified?.message).toContain(item.code)
        expect(classified?.message).toContain("llm.internal")
      })
    }

    test("bare fetch failed", () => {
      const classified = classifyDefect(new TypeError("fetch failed"))
      expect(classified?.status).toBe(502)
      expect(classified?.message).toContain("fetch failed")
    })
  })

  describe("LLMError", () => {
    test("transport", () => {
      const classified = classifyDefect(
        new LLMError({
          module: "openai-compatible",
          method: "stream",
          reason: new TransportReason({
            _tag: "Transport",
            message: "connection closed mid stream",
            kind: "stream",
            url: "https://llm.internal:8000/v1/chat/completions?api-key=super-secret",
          }),
        }),
      )
      expect(classified?.status).toBe(502)
      expect(classified?.message).toContain("https://llm.internal:8000")
      expect(classified?.message).not.toContain("super-secret")
    })

    test("authentication", () => {
      const classified = classifyDefect(
        new LLMError({
          module: "openai-compatible",
          method: "stream",
          reason: new AuthenticationReason({ _tag: "Authentication", message: "invalid api key", kind: "invalid" }),
        }),
      )
      expect(classified?.status).toBe(401)
      expect(classified?.message).toContain("invalid")
    })

    test("upstream 5xx keeps the status visible", () => {
      const classified = classifyDefect(
        new LLMError({
          module: "openai-compatible",
          method: "stream",
          reason: new ProviderInternalReason({ _tag: "ProviderInternal", message: "engine crashed", status: 503 }),
        }),
      )
      expect(classified?.status).toBe(502)
      expect(classified?.message).toContain("503")
    })

    test("malformed output hints at a non OpenAI compatible endpoint", () => {
      const classified = classifyDefect(
        new LLMError({
          module: "openai-compatible",
          method: "stream",
          reason: new InvalidProviderOutputReason({ _tag: "InvalidProviderOutput", message: "unexpected token <" }),
        }),
      )
      expect(classified?.status).toBe(502)
      expect(classified?.name).toBe("ProviderInvalidOutputError")
    })
  })

  describe("AI SDK errors", () => {
    test("APICallError surfaces status, origin and body", () => {
      const classified = classifyDefect(
        Object.assign(new Error("Not Found"), {
          name: "AI_APICallError",
          statusCode: 404,
          url: "https://llm.internal:8000/v1/chat/completions?api-key=super-secret",
          responseBody: '{"error":{"message":"The model does not exist"}}',
        }),
      )
      expect(classified?.status).toBe(400)
      expect(classified?.upstream).toBe(404)
      expect(classified?.message).toContain("HTTP 404")
      expect(classified?.message).toContain("https://llm.internal:8000")
      expect(classified?.message).toContain("The model does not exist")
      expect(classified?.message).not.toContain("super-secret")
    })

    test("401 maps to unauthorized", () => {
      const classified = classifyDefect(
        Object.assign(new Error("Unauthorized"), { name: "AI_APICallError", statusCode: 401 }),
      )
      expect(classified?.status).toBe(401)
    })

    test("5xx maps to bad gateway", () => {
      const classified = classifyDefect(
        Object.assign(new Error("Bad Gateway"), { name: "AI_APICallError", statusCode: 502 }),
      )
      expect(classified?.status).toBe(502)
    })

    test("malformed json", () => {
      const classified = classifyDefect(Object.assign(new Error("parse"), { name: "AI_JSONParseError" }))
      expect(classified?.status).toBe(502)
      expect(classified?.name).toBe("ProviderInvalidOutputError")
    })

    test("tool call errors are called out", () => {
      const classified = classifyDefect(Object.assign(new Error("bad tool"), { name: "AI_NoSuchToolError" }))
      expect(classified?.name).toBe("ProviderToolCallError")
      expect(classified?.message).toContain("tool calling")
    })
  })

  test("long provider text is truncated", () => {
    const classified = classifyDefect(
      Object.assign(new Error("x"), {
        name: "AI_APICallError",
        statusCode: 500,
        responseBody: "y".repeat(5000),
      }),
    )
    expect(classified!.message.length).toBeLessThan(400)
  })
})
