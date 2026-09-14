export * as Variant from "./variant.js"

import { Model } from "./model.js"
import { Provider } from "./provider.js"

export type Support =
  | { readonly type: "effort"; readonly values?: readonly string[] }
  | { readonly type: "toggle" }
  | { readonly type: "budget_tokens"; readonly min?: number; readonly max?: number }

type Variants = Model.Info["variants"]
type Overlay = Omit<Variants[number], "id">

type Protocol = (model: Model.Info, support: Support) => Variants

export function resolve(model: Model.Info, supports: readonly Support[] = [{ type: "effort" }]): Variants {
  const protocol = model.package === undefined ? undefined : PROTOCOLS[model.package]
  if (!protocol) return []
  const toggle = supports.some((support) => support.type === "toggle") ? protocol(model, { type: "toggle" }) : []
  const effort = supports.find((support) => support.type === "effort")
  const budget = supports.find((support) => support.type === "budget_tokens")
  const main = effort ? protocol(model, effort) : budget ? protocol(model, budget) : toggle
  const variants = [...toggle.filter((variant) => variant.id === "none"), ...main]
  return variants.filter((variant, index) => variants.findIndex((other) => other.id === variant.id) === index)
}

const EFFORTS = ["low", "medium", "high"]
const ENCRYPTED_REASONING = ["reasoning.encrypted_content"]
const ADAPTIVE_THINKING = { type: "adaptive", display: "summarized" }
const OUTPUT_TOKEN_MAX = 32_000

const variant = (id: string, overlay: Overlay): Variants[number] => ({ id: Model.VariantID.make(id), ...overlay })

const efforts = (values: readonly string[], spell: (effort: string) => Overlay): Variants =>
  values.map((effort) => variant(effort, spell(effort)))

const toggle = (off: Overlay, on: Overlay): Variants => [variant("none", off), variant("thinking", on)]

function budgets(
  model: Model.Info,
  support: Extract<Support, { type: "budget_tokens" }>,
  spell: (tokens: number) => Overlay,
): Variants {
  const maximum = Math.min(support.max ?? OUTPUT_TOKEN_MAX - 1, model.limit.output - 1, OUTPUT_TOKEN_MAX - 1)
  if (maximum <= 0) return []
  const high = Math.min(Math.max(support.min ?? 0, Math.floor((maximum + 1) / 2)), maximum)
  return [variant("high", spell(high)), variant("max", spell(maximum))]
}

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

const openaiChat: Protocol = (_, support) => {
  if (support.type !== "effort") return []
  return efforts(support.values ?? EFFORTS, (effort) => ({ settings: { reasoningEffort: effort } }))
}

const openaiResponses: Protocol = (_, support) => {
  if (support.type !== "effort") return []
  return efforts(support.values ?? ["none", "minimal", ...EFFORTS, "xhigh"], responsesEffort)
}

const responsesEffort = (effort: string): Overlay => ({
  settings: { reasoningEffort: effort, reasoningSummary: "auto", include: ENCRYPTED_REASONING },
})

const anthropicMessages: Protocol = (model, support) => {
  const manual = claudeThinksManually(model)
  switch (support.type) {
    case "effort":
      return efforts(support.values ?? (manual ? EFFORTS : [...EFFORTS, "xhigh", "max"]), (effort) => ({
        settings: manual ? { effort } : { thinking: ADAPTIVE_THINKING, effort },
      }))
    case "toggle":
      return toggle({ settings: { thinking: { type: "disabled" } } }, { settings: { thinking: ADAPTIVE_THINKING } })
    case "budget_tokens":
      return budgets(model, support, (tokens) => ({
        settings: { thinking: { type: "enabled", budgetTokens: tokens } },
      }))
  }
}

const gemini: Protocol = (model, support) => {
  switch (support.type) {
    case "effort":
      return efforts(support.values ?? EFFORTS, (effort) => ({
        settings: { thinkingConfig: { includeThoughts: true, thinkingLevel: effort } },
      }))
    case "toggle":
      return toggle(
        { settings: { thinkingConfig: { includeThoughts: false, thinkingBudget: 0 } } },
        { settings: { thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } } },
      )
    case "budget_tokens":
      return budgets(model, support, (tokens) => ({
        settings: { thinkingConfig: { includeThoughts: true, thinkingBudget: tokens } },
      }))
  }
}

const openrouter: Protocol = (model, support) => {
  switch (support.type) {
    case "effort":
      return efforts(support.values ?? EFFORTS, (effort) => ({ settings: { reasoning: { effort } } }))
    case "toggle":
      return toggle({ settings: { reasoning: { enabled: false } } }, { settings: { reasoning: { enabled: true } } })
    case "budget_tokens":
      return budgets(model, support, (tokens) => ({ settings: { reasoning: { max_tokens: tokens } } }))
  }
}

const bedrockConverse: Protocol = (model, support) => {
  const id = modelID(model)
  const claude = id.includes("anthropic")
  const fields = (fields: Record<string, unknown>): Overlay => ({ body: { additionalModelRequestFields: fields } })
  switch (support.type) {
    case "effort":
      return efforts(support.values ?? EFFORTS, (effort) => {
        if (claude)
          return fields({
            ...(claudeThinksManually(model) ? {} : { thinking: ADAPTIVE_THINKING }),
            output_config: { effort },
          })
        if (id.includes("openai.gpt-oss")) return fields({ reasoning_effort: effort })
        if (id.includes("openai.")) return fields({ reasoning: { effort } })
        return fields({ reasoningConfig: { type: "enabled", maxReasoningEffort: effort } })
      })
    case "toggle":
      return claude
        ? toggle(fields({ thinking: { type: "disabled" } }), fields({ thinking: ADAPTIVE_THINKING }))
        : toggle(fields({ reasoningConfig: { type: "disabled" } }), fields({ reasoningConfig: { type: "enabled" } }))
    case "budget_tokens":
      return budgets(model, support, (tokens) =>
        claude
          ? fields({ thinking: { type: "enabled", budget_tokens: tokens } })
          : fields({ reasoningConfig: { type: "enabled", budgetTokens: tokens } }),
      )
  }
}

const alibabaAISDK: Protocol = (model, support) => {
  switch (support.type) {
    case "effort":
      return []
    case "toggle":
      return toggle({ settings: { enableThinking: false } }, { settings: { enableThinking: true } })
    case "budget_tokens":
      return budgets(model, support, (tokens) => ({ settings: { enableThinking: true, thinkingBudget: tokens } }))
  }
}

const cohere: Protocol = (model, support) => {
  switch (support.type) {
    case "effort":
      return []
    case "toggle":
      return toggle({ settings: { thinking: { type: "disabled" } } }, { settings: { thinking: { type: "enabled" } } })
    case "budget_tokens":
      return budgets(model, support, (tokens) => ({ settings: { thinking: { type: "enabled", tokenBudget: tokens } } }))
  }
}

const bedrockAISDK: Protocol = (model, support) => {
  const claude = modelID(model).includes("anthropic")
  switch (support.type) {
    case "effort":
      return efforts(support.values ?? EFFORTS, (effort) => ({
        settings: claude
          ? {
              reasoningConfig: {
                ...(claudeThinksManually(model) ? {} : ADAPTIVE_THINKING),
                maxReasoningEffort: effort,
              },
            }
          : { reasoningConfig: { type: "enabled", maxReasoningEffort: effort } },
      }))
    case "toggle":
      return claude
        ? toggle(
            { settings: { additionalModelRequestFields: { thinking: { type: "disabled" } } } },
            { settings: { additionalModelRequestFields: { thinking: ADAPTIVE_THINKING } } },
          )
        : toggle(
            { settings: { additionalModelRequestFields: { reasoningConfig: { type: "disabled" } } } },
            { settings: { additionalModelRequestFields: { reasoningConfig: { type: "enabled" } } } },
          )
    case "budget_tokens":
      return budgets(model, support, (tokens) => ({
        settings: { reasoningConfig: { type: "enabled", budgetTokens: tokens } },
      }))
  }
}

const vercelGateway: Protocol = (model, support) => {
  const prefix = modelID(model).split("/")[0]
  if (prefix === "anthropic") return anthropicMessages(model, support)
  if (prefix === "google") return gemini(model, support)
  if (prefix === "amazon") return bedrockAISDK(model, support)
  if (prefix === "alibaba") return alibabaAISDK(model, support)
  return support.type === "effort" ? openaiChat(model, support) : openrouter(model, support)
}

const sapAICore: Protocol = (model, support) => {
  const id = modelID(model)
  const sap = (modelParams: Record<string, unknown>): Overlay => ({ settings: { modelParams } })
  switch (support.type) {
    case "effort":
      return efforts(support.values ?? EFFORTS, (effort) => {
        if (id.includes("anthropic"))
          return sap({
            additionalModelRequestFields: {
              ...(claudeThinksManually(model) ? {} : { thinking: ADAPTIVE_THINKING }),
              output_config: { effort },
            },
          })
        if (id.includes("gemini")) return sap({ thinkingConfig: { includeThoughts: true, thinkingLevel: effort } })
        if (id.includes("amazon--nova")) return sap({ additionalModelRequestFields: { output_config: { effort } } })
        return sap({ reasoning_effort: effort })
      })
    case "toggle":
      if (id.includes("gemini"))
        return toggle(
          sap({ thinkingConfig: { includeThoughts: false, thinkingBudget: 0 } }),
          sap({ thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } }),
        )
      if (id.includes("cohere"))
        return toggle(sap({ thinking: { type: "disabled" } }), sap({ thinking: { type: "enabled" } }))
      if (id.includes("amazon--nova"))
        return toggle(
          sap({ additionalModelRequestFields: { thinking: { type: "disabled" } } }),
          sap({ additionalModelRequestFields: { thinking: { type: "enabled" } } }),
        )
      if (id.includes("anthropic"))
        return toggle(
          sap({ additionalModelRequestFields: { thinking: { type: "disabled" } } }),
          sap({ additionalModelRequestFields: { thinking: ADAPTIVE_THINKING } }),
        )
      return []
    case "budget_tokens":
      if (id.includes("anthropic"))
        return budgets(model, support, (tokens) =>
          sap({ additionalModelRequestFields: { thinking: { type: "enabled", budget_tokens: tokens } } }),
        )
      if (id.includes("gemini"))
        return budgets(model, support, (tokens) =>
          sap({ thinkingConfig: { includeThoughts: true, thinkingBudget: tokens } }),
        )
      if (id.includes("cohere"))
        return budgets(model, support, (tokens) => sap({ thinking: { type: "enabled", token_budget: tokens } }))
      return []
  }
}

const PROTOCOLS: Readonly<Record<string, Protocol>> = {
  "@opencode/ai/providers/openai": openaiResponses,
  "@opencode/ai/providers/azure/responses": openaiResponses,
  "@opencode/ai/providers/amazon-bedrock/mantle/chat": openaiResponses,
  "@opencode/ai/providers/amazon-bedrock/mantle/responses": openaiResponses,
  "@opencode/ai/providers/alibaba/responses": openaiResponses,
  "@opencode/ai/providers/meta/responses": openaiResponses,
  "@opencode/ai/providers/minimax/responses": openaiResponses,
  "@opencode/ai/providers/moonshot/responses": openaiResponses,
  "@opencode/ai/providers/zai-coding-plan/responses": openaiResponses,

  "@opencode/ai/providers/openai-compatible": openaiChat,
  "@opencode/ai/providers/google-vertex/chat": openaiChat,
  "@opencode/ai/providers/alibaba/chat": openaiChat,
  "@opencode/ai/providers/baseten": openaiChat,
  "@opencode/ai/providers/cerebras": openaiChat,
  "@opencode/ai/providers/cloudflare-workers-ai": openaiChat,
  "@opencode/ai/providers/deepinfra": openaiChat,
  "@opencode/ai/providers/deepseek": openaiChat,
  "@opencode/ai/providers/fireworks": openaiChat,
  "@opencode/ai/providers/groq": openaiChat,
  "@opencode/ai/providers/meta/chat": openaiChat,
  "@opencode/ai/providers/minimax/chat": openaiChat,
  "@opencode/ai/providers/mistral": openaiChat,
  "@opencode/ai/providers/moonshot/chat": openaiChat,
  "@opencode/ai/providers/togetherai": openaiChat,
  "@opencode/ai/providers/xai": openaiChat,
  "@opencode/ai/providers/zai/chat": openaiChat,
  "@opencode/ai/providers/zai-coding-plan/chat": openaiChat,

  "@opencode/ai/providers/anthropic": anthropicMessages,
  "@opencode/ai/providers/google-vertex/messages": anthropicMessages,
  "@opencode/ai/providers/alibaba/messages": anthropicMessages,
  "@opencode/ai/providers/meta/messages": anthropicMessages,
  "@opencode/ai/providers/minimax/messages": anthropicMessages,
  "@opencode/ai/providers/moonshot/messages": anthropicMessages,
  "@opencode/ai/providers/zai-coding-plan/messages": anthropicMessages,

  "@opencode/ai/providers/google": gemini,
  "@opencode/ai/providers/google-vertex": gemini,

  "@opencode/ai/providers/amazon-bedrock": bedrockConverse,
  "@opencode/ai/providers/openrouter": openrouter,

  [Provider.aisdk("venice-ai-sdk-provider")]: openaiChat,
  [Provider.aisdk("ai-gateway-provider")]: openaiChat,
  [Provider.aisdk("@ai-sdk/gateway")]: vercelGateway,
  [Provider.aisdk("@jerome-benoit/sap-ai-provider-v2")]: sapAICore,
  [Provider.aisdk("@ai-sdk/alibaba")]: alibabaAISDK,
  [Provider.aisdk("@ai-sdk/cohere")]: cohere,
}
