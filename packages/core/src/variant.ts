export * as Variant from "./variant.js"

import { Model } from "./model.js"
import { Provider } from "./provider.js"

export type Option =
  | { readonly type: "effort"; readonly values: readonly (string | null)[] }
  | { readonly type: "toggle" }
  | { readonly type: "budget_tokens"; readonly min?: number; readonly max?: number }

type Overlay = Omit<Model.Info["variants"][number], "id">
type Toggle = readonly [off: Overlay, on: Overlay]

// How one package spells the three reasoning controls. `undefined` means this package or model has no way to say it.
type Format = {
  readonly effort?: (model: Model.Info, value: string) => Overlay | undefined
  readonly toggle?: (model: Model.Info) => Toggle | undefined
  readonly budget?: (model: Model.Info, tokens: number) => Overlay | undefined
}

// `model.package` must be the effective package: a model-level override or the provider's.
export function resolve(model: Model.Info, options: readonly Option[]): Model.Info["variants"] {
  const format = model.package === undefined ? undefined : FORMATS[model.package]
  if (!format || options.length === 0) return []
  const toggle = options.some((option) => option.type === "toggle") ? toggleVariants(format, model) : []
  const off = toggle.filter((variant) => variant.id === "none")
  const effort = options.find((option) => option.type === "effort")
  if (effort?.type === "effort") {
    const variants = [
      ...off,
      ...effort.values.flatMap((value) => {
        if (value === null || value === "null") return []
        if (value === "none" && off.length > 0) return []
        const overlay = format.effort?.(model, value)
        return overlay ? [{ id: Model.VariantID.make(value), ...overlay }] : []
      }),
    ]
    return [...new Map(variants.map((variant) => [variant.id, variant])).values()]
  }
  const budget = options.find((option) => option.type === "budget_tokens")
  if (budget?.type === "budget_tokens") return [...off, ...budgetVariants(format, model, budget)]
  return toggle
}

function toggleVariants(format: Format, model: Model.Info): Model.Info["variants"] {
  const pair = format.toggle?.(model)
  if (!pair) return []
  return [
    { id: Model.VariantID.make("none"), ...pair[0] },
    { id: Model.VariantID.make("thinking"), ...pair[1] },
  ]
}

const OUTPUT_TOKEN_MAX = 32_000

function budgetVariants(
  format: Format,
  model: Model.Info,
  option: Extract<Option, { type: "budget_tokens" }>,
): Model.Info["variants"] {
  const maximum = Math.min(option.max ?? OUTPUT_TOKEN_MAX - 1, model.limit.output - 1, OUTPUT_TOKEN_MAX - 1)
  if (maximum <= 0) return []
  const high = Math.min(Math.max(option.min ?? 0, Math.floor((maximum + 1) / 2)), maximum)
  return [
    { id: "high", budget: high },
    { id: "max", budget: maximum },
  ].flatMap((item) => {
    const overlay = format.budget?.(model, item.budget)
    return overlay ? [{ id: Model.VariantID.make(item.id), ...overlay }] : []
  })
}

// ── Wire spellings ─────────────────────────────────────────────────────────────────────────────────────────
// One function per way a control appears on the wire. Packages below compose these.

const pair = (spell: (on: boolean) => Overlay): Toggle => [spell(false), spell(true)]

const ENCRYPTED_REASONING = ["reasoning.encrypted_content"]
const ADAPTIVE_THINKING = { type: "adaptive", display: "summarized" }

// effort
const chatReasoningEffort = (value: string): Overlay => ({ settings: { reasoningEffort: value } })
const responsesReasoningEffort = (value: string): Overlay => ({
  settings: { reasoningEffort: value, reasoningSummary: "auto", include: ENCRYPTED_REASONING },
})
const anthropicEffort = (model: Model.Info, value: string): Overlay => ({
  settings: claudeThinksManually(model) ? { effort: value } : { thinking: ADAPTIVE_THINKING, effort: value },
})
const geminiThinkingLevel = (value: string): Overlay => ({
  settings: { thinkingConfig: { includeThoughts: true, thinkingLevel: value } },
})
const openrouterReasoningEffort = (value: string): Overlay => ({ settings: { reasoning: { effort: value } } })

// toggle
const anthropicThinking = pair((on) => ({ settings: { thinking: on ? ADAPTIVE_THINKING : { type: "disabled" } } }))
const geminiThinking = pair((on) => ({
  settings: {
    thinkingConfig: on ? { includeThoughts: true, thinkingBudget: -1 } : { includeThoughts: false, thinkingBudget: 0 },
  },
}))
const openrouterReasoning = pair((on) => ({ settings: { reasoning: { enabled: on } } }))
const enableThinking = pair((on) => ({ settings: { enableThinking: on } }))
const cohereThinking = pair((on) => ({ settings: { thinking: { type: on ? "enabled" : "disabled" } } }))

// budget
const anthropicBudget = (tokens: number): Overlay => ({
  settings: { thinking: { type: "enabled", budgetTokens: tokens } },
})
const geminiBudget = (tokens: number): Overlay => ({
  settings: { thinkingConfig: { includeThoughts: true, thinkingBudget: tokens } },
})
const openrouterBudget = (tokens: number): Overlay => ({ settings: { reasoning: { max_tokens: tokens } } })
const cohereBudget = (tokens: number): Overlay => ({ settings: { thinking: { type: "enabled", tokenBudget: tokens } } })
const enableThinkingBudget = (tokens: number): Overlay => ({
  settings: { enableThinking: true, thinkingBudget: tokens },
})

// ── Shared formats ─────────────────────────────────────────────────────────────────────────────────────────

const openaiChat: Format = {
  effort: (_, value) => chatReasoningEffort(value),
}

const openaiResponses: Format = {
  effort: (_, value) => responsesReasoningEffort(value),
}

const anthropicMessages: Format = {
  effort: anthropicEffort,
  toggle: () => anthropicThinking,
  budget: (_, tokens) => anthropicBudget(tokens),
}

const gemini: Format = {
  effort: (_, value) => geminiThinkingLevel(value),
  toggle: () => geminiThinking,
  budget: (_, tokens) => geminiBudget(tokens),
}

const openrouter: Format = {
  effort: (_, value) => openrouterReasoningEffort(value),
  toggle: () => openrouterReasoning,
  budget: (_, tokens) => openrouterBudget(tokens),
}

// Bedrock Converse has no reasoning options; everything rides in `additionalModelRequestFields`.
const bedrockConverse: Format = {
  effort: (model, value) => {
    const id = modelID(model)
    if (id.includes("anthropic"))
      return bedrockFields({
        ...(claudeThinksManually(model) ? {} : { thinking: ADAPTIVE_THINKING }),
        output_config: { effort: value },
      })
    if (id.includes("openai.gpt-oss")) return bedrockFields({ reasoning_effort: value })
    if (id.includes("openai.")) return bedrockFields({ reasoning: { effort: value } })
    return bedrockFields({ reasoningConfig: { type: "enabled", maxReasoningEffort: value } })
  },
  toggle: (model) =>
    modelID(model).includes("anthropic")
      ? pair((on) => bedrockFields({ thinking: on ? ADAPTIVE_THINKING : { type: "disabled" } }))
      : pair((on) => bedrockFields({ reasoningConfig: { type: on ? "enabled" : "disabled" } })),
  budget: (model, tokens) =>
    modelID(model).includes("anthropic")
      ? bedrockFields({ thinking: { type: "enabled", budget_tokens: tokens } })
      : bedrockFields({ reasoningConfig: { type: "enabled", budgetTokens: tokens } }),
}

const bedrockFields = (fields: Record<string, unknown>): Overlay => ({ body: { additionalModelRequestFields: fields } })

// ── AI SDK-only formats (no native package; translated by AISDKNative at resolve time) ────────────────────

const githubCopilot: Format = {
  effort: (model, value) => {
    const id = modelID(model)
    if (id.includes("gemini")) return
    if (id.includes("claude")) return chatReasoningEffort(value)
    return responsesReasoningEffort(value)
  },
}

const alibabaAISDK: Format = {
  toggle: () => enableThinking,
  budget: (_, tokens) => enableThinkingBudget(tokens),
}

const cohere: Format = {
  toggle: () => cohereThinking,
  budget: (_, tokens) => cohereBudget(tokens),
}

// Bedrock Converse via the AI SDK spells everything as `reasoningConfig` settings; AISDKNative turns it into body.
const bedrockAISDK: Format = {
  effort: (model, value) => ({
    settings: modelID(model).includes("anthropic")
      ? { reasoningConfig: { ...(claudeThinksManually(model) ? {} : ADAPTIVE_THINKING), maxReasoningEffort: value } }
      : { reasoningConfig: { type: "enabled", maxReasoningEffort: value } },
  }),
  toggle: (model) =>
    modelID(model).includes("anthropic")
      ? pair((on) => ({
          settings: { additionalModelRequestFields: { thinking: on ? ADAPTIVE_THINKING : { type: "disabled" } } },
        }))
      : pair((on) => ({
          settings: { additionalModelRequestFields: { reasoningConfig: { type: on ? "enabled" : "disabled" } } },
        })),
  budget: (_, tokens) => ({ settings: { reasoningConfig: { type: "enabled", budgetTokens: tokens } } }),
}

// Vercel's gateway relays other labs' models and takes their spelling when the id names one.
const vercelGateway: Format = {
  effort: (model, value) => (gatewayUpstream(model) ?? openaiChat).effort?.(model, value),
  toggle: (model) => (gatewayUpstream(model) ?? openrouter).toggle?.(model),
  budget: (model, tokens) => (gatewayUpstream(model) ?? openrouter).budget?.(model, tokens),
}

function gatewayUpstream(model: Model.Info): Format | undefined {
  const id = modelID(model)
  const separator = id.indexOf("/")
  if (separator <= 0) return
  const prefix = id.slice(0, separator)
  if (prefix === "anthropic") return anthropicMessages
  if (prefix === "google") return gemini
  if (prefix === "amazon") return bedrockAISDK
  if (prefix === "alibaba") return alibabaAISDK
}

// SAP AI Core wraps each upstream's fields in `modelParams`.
const sapAICore: Format = {
  effort: (model, value) => {
    const id = modelID(model)
    if (id.includes("anthropic"))
      return sap({
        additionalModelRequestFields: {
          ...(claudeThinksManually(model) ? {} : { thinking: ADAPTIVE_THINKING }),
          output_config: { effort: value },
        },
      })
    if (id.includes("gemini")) return sap({ thinkingConfig: { includeThoughts: true, thinkingLevel: value } })
    if (id.includes("amazon--nova")) return sap({ additionalModelRequestFields: { output_config: { effort: value } } })
    return sap({ reasoning_effort: value })
  },
  toggle: (model) => {
    const id = modelID(model)
    if (id.includes("gemini"))
      return pair((on) =>
        sap({
          thinkingConfig: on
            ? { includeThoughts: true, thinkingBudget: -1 }
            : { includeThoughts: false, thinkingBudget: 0 },
        }),
      )
    if (id.includes("cohere")) return pair((on) => sap({ thinking: { type: on ? "enabled" : "disabled" } }))
    if (id.includes("amazon--nova"))
      return pair((on) => sap({ additionalModelRequestFields: { thinking: { type: on ? "enabled" : "disabled" } } }))
    if (id.includes("anthropic"))
      return pair((on) =>
        sap({ additionalModelRequestFields: { thinking: on ? ADAPTIVE_THINKING : { type: "disabled" } } }),
      )
  },
  budget: (model, tokens) => {
    const id = modelID(model)
    if (id.includes("anthropic"))
      return sap({ additionalModelRequestFields: { thinking: { type: "enabled", budget_tokens: tokens } } })
    if (id.includes("gemini")) return sap({ thinkingConfig: { includeThoughts: true, thinkingBudget: tokens } })
    if (id.includes("cohere")) return sap({ thinking: { type: "enabled", token_budget: tokens } })
  },
}

const sap = (modelParams: Record<string, unknown>): Overlay => ({ settings: { modelParams } })

// ── Model checks ───────────────────────────────────────────────────────────────────────────────────────────

const modelID = (model: Model.Info) => model.modelID ?? model.id

// Claude before 4.6 has no adaptive thinking; effort is sent on its own.
function claudeThinksManually(model: Model.Info) {
  const id = modelID(model)
  const familyFirst = /(?:claude-)?(?:opus|sonnet|haiku)-(\d+)(?:[.-](\d+))?/i.exec(id)
  const versionFirst = /claude-(\d+)(?:[.-](\d+))?-(?:opus|sonnet|haiku)/i.exec(id)
  const major = Number(familyFirst?.[1] ?? versionFirst?.[1])
  const rawMinor = Number(familyFirst?.[2] ?? versionFirst?.[2] ?? 0)
  if (!Number.isFinite(major)) return false
  const minor = rawMinor > 9 ? 0 : rawMinor
  return major < 4 || (major === 4 && minor < 6)
}

// ── Packages ───────────────────────────────────────────────────────────────────────────────────────────────
// One entry per catalog package. Share a format by pointing at it; specialise by spreading and overriding.

const FORMATS: Readonly<Record<string, Format>> = {
  "@opencode/ai/providers/openai": openaiResponses,
  "@opencode/ai/providers/azure/responses": openaiResponses,
  "@opencode/ai/providers/amazon-bedrock/mantle/chat": openaiResponses,
  "@opencode/ai/providers/amazon-bedrock/mantle/responses": openaiResponses,
  "@opencode/ai/providers/meta/responses": openaiResponses,

  "@opencode/ai/providers/openai-compatible": openaiChat,
  "@opencode/ai/providers/baseten": openaiChat,
  "@opencode/ai/providers/cerebras": openaiChat,
  "@opencode/ai/providers/cloudflare-workers-ai": openaiChat,
  "@opencode/ai/providers/deepinfra": openaiChat,
  "@opencode/ai/providers/deepseek": openaiChat,
  "@opencode/ai/providers/fireworks": openaiChat,
  "@opencode/ai/providers/groq": openaiChat,
  "@opencode/ai/providers/mistral": openaiChat,
  "@opencode/ai/providers/togetherai": openaiChat,
  "@opencode/ai/providers/xai": openaiChat,

  "@opencode/ai/providers/anthropic": anthropicMessages,
  "@opencode/ai/providers/google-vertex/messages": anthropicMessages,
  "@opencode/ai/providers/minimax/messages": anthropicMessages,

  "@opencode/ai/providers/google": gemini,
  "@opencode/ai/providers/google-vertex": gemini,

  "@opencode/ai/providers/amazon-bedrock": bedrockConverse,
  "@opencode/ai/providers/openrouter": openrouter,

  [Provider.aisdk("@ai-sdk/openai")]: openaiResponses,
  [Provider.aisdk("@ai-sdk/azure")]: openaiResponses,
  [Provider.aisdk("@ai-sdk/amazon-bedrock/mantle")]: openaiResponses,
  [Provider.aisdk("@ai-sdk/openai-compatible")]: openaiChat,
  [Provider.aisdk("@ai-sdk/cerebras")]: openaiChat,
  [Provider.aisdk("@ai-sdk/deepinfra")]: openaiChat,
  [Provider.aisdk("@ai-sdk/groq")]: openaiChat,
  [Provider.aisdk("@ai-sdk/mistral")]: openaiChat,
  [Provider.aisdk("@ai-sdk/togetherai")]: openaiChat,
  [Provider.aisdk("@ai-sdk/xai")]: openaiChat,
  [Provider.aisdk("venice-ai-sdk-provider")]: openaiChat,
  [Provider.aisdk("ai-gateway-provider")]: openaiChat,
  [Provider.aisdk("@ai-sdk/anthropic")]: anthropicMessages,
  [Provider.aisdk("@ai-sdk/google-vertex/anthropic")]: anthropicMessages,
  [Provider.aisdk("@ai-sdk/google")]: gemini,
  [Provider.aisdk("@ai-sdk/google-vertex")]: gemini,
  [Provider.aisdk("@ai-sdk/amazon-bedrock")]: bedrockAISDK,
  [Provider.aisdk("@openrouter/ai-sdk-provider")]: openrouter,
  [Provider.aisdk("@ai-sdk/gateway")]: vercelGateway,
  [Provider.aisdk("@ai-sdk/github-copilot")]: githubCopilot,
  [Provider.aisdk("@jerome-benoit/sap-ai-provider-v2")]: sapAICore,
  [Provider.aisdk("@ai-sdk/alibaba")]: alibabaAISDK,
  [Provider.aisdk("@ai-sdk/cohere")]: cohere,
}
