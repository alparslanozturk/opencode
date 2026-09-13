export * as Variant from "./variant.js"

import { Model } from "./model.js"
import { Provider } from "./provider.js"

export type Option =
  | { readonly type: "effort"; readonly values: readonly (string | null)[] }
  | { readonly type: "toggle" }
  | { readonly type: "budget_tokens"; readonly min?: number; readonly max?: number }

type Overlay = Omit<Model.Info["variants"][number], "id">
type Pair = readonly [off: Overlay, on: Overlay]

type Family = {
  readonly packages: readonly string[]
  readonly effort?: (modelID: string, effort: string) => Overlay | undefined
  readonly toggle?: (modelID: string) => Pair | undefined
  readonly budget?: (modelID: string, budget: number) => Overlay | undefined
}

// `model.package` must be the effective package: a model-level override or the provider's.
export function resolve(model: Model.Info, options: readonly Option[]): Model.Info["variants"] {
  const family = FAMILIES.find((item) => item.packages.includes(model.package ?? ""))
  if (!family || options.length === 0) return []
  const modelID = model.modelID ?? model.id
  const toggle = options.some((option) => option.type === "toggle") ? toggleVariants(family, modelID) : []
  const off = toggle.filter((variant) => variant.id === "none")
  const effort = options.find((option) => option.type === "effort")
  if (effort?.type === "effort") {
    const variants = [
      ...off,
      ...effort.values.flatMap((value) => {
        if (value === null || value === "null") return []
        if (value === "none" && off.length > 0) return []
        const overlay = family.effort?.(modelID, value)
        return overlay ? [{ id: Model.VariantID.make(value), ...overlay }] : []
      }),
    ]
    return [...new Map(variants.map((variant) => [variant.id, variant])).values()]
  }
  const budget = options.find((option) => option.type === "budget_tokens")
  if (budget?.type === "budget_tokens") return [...off, ...budgetVariants(family, model, budget)]
  return toggle
}

function toggleVariants(family: Family, modelID: string): Model.Info["variants"] {
  const pair = family.toggle?.(modelID)
  if (!pair) return []
  return [
    { id: Model.VariantID.make("none"), ...pair[0] },
    { id: Model.VariantID.make("thinking"), ...pair[1] },
  ]
}

const OUTPUT_TOKEN_MAX = 32_000

function budgetVariants(
  family: Family,
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
    const overlay = family.budget?.(modelID, item.budget)
    return overlay ? [{ id: Model.VariantID.make(item.id), ...overlay }] : []
  })
}

const OPENAI_INCLUDE_ENCRYPTED_REASONING = ["reasoning.encrypted_content"]

const openaiResponses: Family = {
  packages: [
    "@opencode/ai/providers/openai",
    "@opencode/ai/providers/azure/responses",
    "@opencode/ai/providers/amazon-bedrock/mantle/chat",
    "@opencode/ai/providers/amazon-bedrock/mantle/responses",
    "@opencode/ai/providers/meta/responses",
    Provider.aisdk("@ai-sdk/openai"),
    Provider.aisdk("@ai-sdk/azure"),
    Provider.aisdk("@ai-sdk/amazon-bedrock/mantle"),
  ],
  effort: (_, effort) => ({
    settings: { reasoningEffort: effort, reasoningSummary: "auto", include: OPENAI_INCLUDE_ENCRYPTED_REASONING },
  }),
}

const openaiChat: Family = {
  packages: [
    "@opencode/ai/providers/openai-compatible",
    "@opencode/ai/providers/baseten",
    "@opencode/ai/providers/cerebras",
    "@opencode/ai/providers/cloudflare-workers-ai",
    "@opencode/ai/providers/deepinfra",
    "@opencode/ai/providers/deepseek",
    "@opencode/ai/providers/fireworks",
    "@opencode/ai/providers/groq",
    "@opencode/ai/providers/mistral",
    "@opencode/ai/providers/togetherai",
    "@opencode/ai/providers/xai",
    Provider.aisdk("@ai-sdk/openai-compatible"),
    Provider.aisdk("@ai-sdk/xai"),
    Provider.aisdk("@ai-sdk/mistral"),
    Provider.aisdk("@ai-sdk/groq"),
    Provider.aisdk("@ai-sdk/cerebras"),
    Provider.aisdk("@ai-sdk/deepinfra"),
    Provider.aisdk("@ai-sdk/togetherai"),
    Provider.aisdk("venice-ai-sdk-provider"),
    Provider.aisdk("ai-gateway-provider"),
  ],
  effort: (_, effort) => ({ settings: { reasoningEffort: effort } }),
}

const anthropic: Family = {
  packages: [
    "@opencode/ai/providers/anthropic",
    "@opencode/ai/providers/google-vertex/messages",
    "@opencode/ai/providers/minimax/messages",
    Provider.aisdk("@ai-sdk/anthropic"),
    Provider.aisdk("@ai-sdk/google-vertex/anthropic"),
  ],
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

const gemini: Family = {
  packages: [
    "@opencode/ai/providers/google",
    "@opencode/ai/providers/google-vertex",
    Provider.aisdk("@ai-sdk/google"),
    Provider.aisdk("@ai-sdk/google-vertex"),
  ],
  effort: (_, effort) => ({ settings: { thinkingConfig: { includeThoughts: true, thinkingLevel: effort } } }),
  toggle: () => [
    { settings: { thinkingConfig: { includeThoughts: false, thinkingBudget: 0 } } },
    { settings: { thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } } },
  ],
  budget: (_, budget) => ({ settings: { thinkingConfig: { includeThoughts: true, thinkingBudget: budget } } }),
}

const bedrockConverse: Family = {
  packages: ["@opencode/ai/providers/amazon-bedrock", Provider.aisdk("@ai-sdk/amazon-bedrock")],
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

const openrouter: Family = {
  packages: ["@opencode/ai/providers/openrouter", Provider.aisdk("@openrouter/ai-sdk-provider")],
  effort: (_, effort) => ({ settings: { reasoning: { effort } } }),
  toggle: () => [{ settings: { reasoning: { enabled: false } } }, { settings: { reasoning: { enabled: true } } }],
  budget: (_, budget) => ({ settings: { reasoning: { max_tokens: budget } } }),
}

const alibaba: Family = {
  packages: [Provider.aisdk("@ai-sdk/alibaba")],
  toggle: () => [{ settings: { enableThinking: false } }, { settings: { enableThinking: true } }],
  budget: (_, budget) => ({ settings: { enableThinking: true, thinkingBudget: budget } }),
}

const cohere: Family = {
  packages: [Provider.aisdk("@ai-sdk/cohere")],
  toggle: () => [{ settings: { thinking: { type: "disabled" } } }, { settings: { thinking: { type: "enabled" } } }],
  budget: (_, budget) => ({ settings: { thinking: { type: "enabled", tokenBudget: budget } } }),
}

const githubCopilot: Family = {
  packages: [Provider.aisdk("@ai-sdk/github-copilot")],
  effort: (modelID, effort) => {
    if (modelID.includes("gemini")) return
    if (modelID.includes("claude")) return { settings: { reasoningEffort: effort } }
    return openaiResponses.effort?.(modelID, effort)
  },
}

const vercelGateway: Family = {
  packages: [Provider.aisdk("@ai-sdk/gateway")],
  effort: (modelID, effort) => (vercelGatewayUpstream(modelID) ?? openaiChat).effort?.(modelID, effort),
  toggle: (modelID) => (vercelGatewayUpstream(modelID) ?? openrouter).toggle?.(modelID),
  budget: (modelID, budget) => (vercelGatewayUpstream(modelID) ?? openrouter).budget?.(modelID, budget),
}

function vercelGatewayUpstream(modelID: string): Family | undefined {
  const separator = modelID.indexOf("/")
  if (separator <= 0) return
  const prefix = modelID.slice(0, separator)
  if (prefix === "anthropic") return anthropic
  if (prefix === "google") return gemini
  if (prefix === "amazon") return bedrockConverse
  if (prefix === "alibaba") return alibaba
}

const sapAICore: Family = {
  packages: [Provider.aisdk("@jerome-benoit/sap-ai-provider-v2")],
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

const FAMILIES = [
  openaiResponses,
  openaiChat,
  anthropic,
  gemini,
  bedrockConverse,
  openrouter,
  vercelGateway,
  githubCopilot,
  sapAICore,
  alibaba,
  cohere,
]
