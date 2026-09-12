export * as Variant from "./variant.js"

import { Model } from "./model.js"
import { Provider } from "./provider.js"

/** What a provider says a model can do with reasoning. Same shape as models.dev `reasoning_options`. */
export type Option =
  | { readonly type: "effort"; readonly values: readonly (string | null)[] }
  | { readonly type: "toggle" }
  | { readonly type: "budget_tokens"; readonly min?: number; readonly max?: number }

type Overlay = Omit<Model.Info["variants"][number], "id">
type Pair = readonly [off: Overlay, on: Overlay]

/** How one package spells reasoning controls. Any operation a package cannot express is left undefined. */
type Package = {
  readonly effort?: (modelID: string, effort: string) => Overlay | undefined
  readonly toggle?: (modelID: string) => Pair | undefined
  readonly budget?: (modelID: string, budget: number) => Overlay | undefined
}

/**
 * Variants for a catalog model. `model.package` must be the effective package (provider or model override);
 * models without one, or on a package this table does not know, get no generated variants.
 */
export function resolve(model: Model.Info, options: readonly Option[]): Model.Info["variants"] {
  const pkg = model.package === undefined ? undefined : PACKAGES[model.package]
  if (!pkg || options.length === 0) return []
  const modelID = model.modelID ?? model.id
  const toggle = options.some((option) => option.type === "toggle") ? toggleVariants(pkg, modelID) : []
  const off = toggle.filter((variant) => variant.id === "none")
  const effort = options.find((option) => option.type === "effort")
  if (effort?.type === "effort") {
    const variants = [
      ...off,
      ...effort.values.flatMap((value) => {
        if (value === null || value === "null") return []
        if (value === "none" && off.length > 0) return []
        const overlay = pkg.effort?.(modelID, value)
        return overlay ? [{ id: Model.VariantID.make(value), ...overlay }] : []
      }),
    ]
    return [...new Map(variants.map((variant) => [variant.id, variant])).values()]
  }
  const budget = options.find((option) => option.type === "budget_tokens")
  if (budget?.type === "budget_tokens") return [...off, ...budgetVariants(pkg, model, budget)]
  return toggle
}

function toggleVariants(pkg: Package, modelID: string): Model.Info["variants"] {
  const pair = pkg.toggle?.(modelID)
  if (!pair) return []
  return [
    { id: Model.VariantID.make("none"), ...pair[0] },
    { id: Model.VariantID.make("thinking"), ...pair[1] },
  ]
}

const OUTPUT_TOKEN_MAX = 32_000

function budgetVariants(
  pkg: Package,
  model: Model.Info,
  option: Extract<Option, { type: "budget_tokens" }>,
): Model.Info["variants"] {
  const maximum = Math.min(option.max ?? OUTPUT_TOKEN_MAX - 1, model.limit.output - 1, OUTPUT_TOKEN_MAX - 1)
  if (maximum <= 0) return []
  const high = Math.min(Math.max(option.min ?? 0, Math.floor((maximum + 1) / 2)), maximum)
  const modelID = model.modelID ?? model.id
  return [
    { id: "high", budget: high },
    { id: "max", budget: maximum },
  ].flatMap((item) => {
    const overlay = pkg.budget?.(modelID, item.budget)
    return overlay ? [{ id: Model.VariantID.make(item.id), ...overlay }] : []
  })
}

// Package families. Each is one spelling of reasoning controls; the table below maps catalog packages onto them.

const OPENAI_INCLUDE_ENCRYPTED_REASONING = ["reasoning.encrypted_content"]

const openai: Package = {
  effort: (_, effort) => ({
    settings: { reasoningEffort: effort, reasoningSummary: "auto", include: OPENAI_INCLUDE_ENCRYPTED_REASONING },
  }),
}

const effortOnly: Package = {
  effort: (_, effort) => ({ settings: { reasoningEffort: effort } }),
}

const anthropic: Package = {
  effort: (modelID, effort) => ({
    settings: anthropicManualThinking(modelID)
      ? { effort }
      : { thinking: { type: "adaptive", display: "summarized" }, effort },
  }),
  toggle: () => [
    { settings: { thinking: { type: "disabled" } } },
    { settings: { thinking: { type: "adaptive", display: "summarized" } } },
  ],
  budget: (_, budget) => ({ settings: { thinking: { type: "enabled", budgetTokens: budget } } }),
}

const google: Package = {
  effort: (_, effort) => ({ settings: { thinkingConfig: { includeThoughts: true, thinkingLevel: effort } } }),
  toggle: () => [
    { settings: { thinkingConfig: { includeThoughts: false, thinkingBudget: 0 } } },
    { settings: { thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } } },
  ],
  budget: (_, budget) => ({ settings: { thinkingConfig: { includeThoughts: true, thinkingBudget: budget } } }),
}

const bedrock: Package = {
  effort: (modelID, effort) => ({
    settings: modelID.includes("anthropic")
      ? {
          reasoningConfig: {
            ...(anthropicManualThinking(modelID) ? {} : { type: "adaptive", display: "summarized" }),
            maxReasoningEffort: effort,
          },
        }
      : { reasoningConfig: { type: "enabled", maxReasoningEffort: effort } },
  }),
  toggle: (modelID) =>
    modelID.includes("anthropic")
      ? [
          { settings: { additionalModelRequestFields: { thinking: { type: "disabled" } } } },
          { settings: { additionalModelRequestFields: { thinking: { type: "adaptive", display: "summarized" } } } },
        ]
      : [
          { settings: { additionalModelRequestFields: { reasoningConfig: { type: "disabled" } } } },
          { settings: { additionalModelRequestFields: { reasoningConfig: { type: "enabled" } } } },
        ],
  budget: (_, budget) => ({ settings: { reasoningConfig: { type: "enabled", budgetTokens: budget } } }),
}

const openrouter: Package = {
  effort: (_, effort) => ({ settings: { reasoning: { effort } } }),
  toggle: () => [{ settings: { reasoning: { enabled: false } } }, { settings: { reasoning: { enabled: true } } }],
  budget: (_, budget) => ({ settings: { reasoning: { max_tokens: budget } } }),
}

const alibaba: Package = {
  toggle: () => [{ settings: { enableThinking: false } }, { settings: { enableThinking: true } }],
  budget: (_, budget) => ({ settings: { enableThinking: true, thinkingBudget: budget } }),
}

const cohere: Package = {
  toggle: () => [{ settings: { thinking: { type: "disabled" } } }, { settings: { thinking: { type: "enabled" } } }],
  budget: (_, budget) => ({ settings: { thinking: { type: "enabled", tokenBudget: budget } } }),
}

const copilot: Package = {
  effort: (modelID, effort) => {
    if (modelID.includes("gemini")) return
    if (modelID.includes("claude")) return { settings: { reasoningEffort: effort } }
    return openai.effort?.(modelID, effort)
  },
}

// Vercel's gateway relays other labs' models; it uses their spellings when the model id names one.
const gateway: Package = {
  effort: (modelID, effort) => (gatewayUpstream(modelID) ?? effortOnly).effort?.(modelID, effort),
  toggle: (modelID) => (gatewayUpstream(modelID) ?? openrouter).toggle?.(modelID),
  budget: (modelID, budget) => (gatewayUpstream(modelID) ?? openrouter).budget?.(modelID, budget),
}

function gatewayUpstream(modelID: string): Package | undefined {
  const separator = modelID.indexOf("/")
  if (separator <= 0) return
  const prefix = modelID.slice(0, separator)
  if (prefix === "anthropic") return anthropic
  if (prefix === "google") return google
  if (prefix === "amazon") return bedrock
  if (prefix === "alibaba") return alibaba
}

// SAP AI Core wraps every upstream in `modelParams` with each lab's own field names.
const sap: Package = {
  effort: (modelID, effort) => {
    if (modelID.includes("anthropic"))
      return {
        settings: {
          modelParams: {
            additionalModelRequestFields: {
              ...(anthropicManualThinking(modelID) ? {} : { thinking: { type: "adaptive", display: "summarized" } }),
              output_config: { effort },
            },
          },
        },
      }
    if (modelID.includes("gemini"))
      return { settings: { modelParams: { thinkingConfig: { includeThoughts: true, thinkingLevel: effort } } } }
    if (modelID.includes("amazon--nova"))
      return { settings: { modelParams: { additionalModelRequestFields: { output_config: { effort } } } } }
    return { settings: { modelParams: { reasoning_effort: effort } } }
  },
  toggle: (modelID) => {
    if (modelID.includes("gemini"))
      return [
        { settings: { modelParams: { thinkingConfig: { includeThoughts: false, thinkingBudget: 0 } } } },
        { settings: { modelParams: { thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } } } },
      ]
    if (modelID.includes("cohere"))
      return [
        { settings: { modelParams: { thinking: { type: "disabled" } } } },
        { settings: { modelParams: { thinking: { type: "enabled" } } } },
      ]
    if (modelID.includes("amazon--nova"))
      return [
        { settings: { modelParams: { additionalModelRequestFields: { thinking: { type: "disabled" } } } } },
        { settings: { modelParams: { additionalModelRequestFields: { thinking: { type: "enabled" } } } } },
      ]
    if (modelID.includes("anthropic"))
      return [
        { settings: { modelParams: { additionalModelRequestFields: { thinking: { type: "disabled" } } } } },
        {
          settings: {
            modelParams: { additionalModelRequestFields: { thinking: { type: "adaptive", display: "summarized" } } },
          },
        },
      ]
  },
  budget: (modelID, budget) => {
    if (modelID.includes("anthropic"))
      return {
        settings: {
          modelParams: { additionalModelRequestFields: { thinking: { type: "enabled", budget_tokens: budget } } },
        },
      }
    if (modelID.includes("gemini"))
      return { settings: { modelParams: { thinkingConfig: { includeThoughts: true, thinkingBudget: budget } } } }
    if (modelID.includes("cohere"))
      return { settings: { modelParams: { thinking: { type: "enabled", token_budget: budget } } } }
  },
}

// Claude before 4.6 has no adaptive thinking; effort is sent on its own.
function anthropicManualThinking(modelID: string) {
  const familyFirst = /(?:claude-)?(?:opus|sonnet|haiku)-(\d+)(?:[.-](\d+))?/i.exec(modelID)
  const versionFirst = /claude-(\d+)(?:[.-](\d+))?-(?:opus|sonnet|haiku)/i.exec(modelID)
  const major = Number(familyFirst?.[1] ?? versionFirst?.[1])
  const rawMinor = Number(familyFirst?.[2] ?? versionFirst?.[2] ?? 0)
  if (!Number.isFinite(major)) return false
  const minor = rawMinor > 9 ? 0 : rawMinor
  return major < 4 || (major === 4 && minor < 6)
}

/** Catalog package → spelling. Native packages first, then AI SDK packages that have no native equivalent. */
const PACKAGES: Readonly<Record<string, Package>> = {
  "@opencode/ai/providers/openai": openai,
  "@opencode/ai/providers/azure/responses": openai,
  "@opencode/ai/providers/amazon-bedrock/mantle/chat": openai,
  "@opencode/ai/providers/amazon-bedrock/mantle/responses": openai,
  "@opencode/ai/providers/meta/responses": openai,
  "@opencode/ai/providers/anthropic": anthropic,
  "@opencode/ai/providers/google-vertex/messages": anthropic,
  "@opencode/ai/providers/minimax/messages": anthropic,
  "@opencode/ai/providers/google": google,
  "@opencode/ai/providers/google-vertex": google,
  "@opencode/ai/providers/amazon-bedrock": bedrock,
  "@opencode/ai/providers/openrouter": openrouter,
  "@opencode/ai/providers/openai-compatible": effortOnly,
  "@opencode/ai/providers/baseten": effortOnly,
  "@opencode/ai/providers/cerebras": effortOnly,
  "@opencode/ai/providers/cloudflare-workers-ai": effortOnly,
  "@opencode/ai/providers/deepinfra": effortOnly,
  "@opencode/ai/providers/deepseek": effortOnly,
  "@opencode/ai/providers/fireworks": effortOnly,
  "@opencode/ai/providers/groq": effortOnly,
  "@opencode/ai/providers/mistral": effortOnly,
  "@opencode/ai/providers/togetherai": effortOnly,
  "@opencode/ai/providers/xai": effortOnly,

  [Provider.aisdk("@ai-sdk/openai")]: openai,
  [Provider.aisdk("@ai-sdk/azure")]: openai,
  [Provider.aisdk("@ai-sdk/amazon-bedrock/mantle")]: openai,
  [Provider.aisdk("@ai-sdk/anthropic")]: anthropic,
  [Provider.aisdk("@ai-sdk/google-vertex/anthropic")]: anthropic,
  [Provider.aisdk("@ai-sdk/google")]: google,
  [Provider.aisdk("@ai-sdk/google-vertex")]: google,
  [Provider.aisdk("@ai-sdk/amazon-bedrock")]: bedrock,
  [Provider.aisdk("@openrouter/ai-sdk-provider")]: openrouter,
  [Provider.aisdk("@ai-sdk/gateway")]: gateway,
  [Provider.aisdk("@ai-sdk/github-copilot")]: copilot,
  [Provider.aisdk("@jerome-benoit/sap-ai-provider-v2")]: sap,
  [Provider.aisdk("@ai-sdk/alibaba")]: alibaba,
  [Provider.aisdk("@ai-sdk/cohere")]: cohere,
  [Provider.aisdk("@ai-sdk/openai-compatible")]: effortOnly,
  [Provider.aisdk("@ai-sdk/xai")]: effortOnly,
  [Provider.aisdk("@ai-sdk/mistral")]: effortOnly,
  [Provider.aisdk("@ai-sdk/groq")]: effortOnly,
  [Provider.aisdk("@ai-sdk/cerebras")]: effortOnly,
  [Provider.aisdk("@ai-sdk/deepinfra")]: effortOnly,
  [Provider.aisdk("@ai-sdk/togetherai")]: effortOnly,
  [Provider.aisdk("venice-ai-sdk-provider")]: effortOnly,
  [Provider.aisdk("ai-gateway-provider")]: effortOnly,
}
