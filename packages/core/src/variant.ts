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

const variant = (id: string, overlay: Overlay): Variants[number] => ({ id: Model.VariantID.make(id), ...overlay })

const efforts = (values: readonly string[], spell: (effort: string) => Overlay): Variants =>
  values.map((effort) => variant(effort, spell(effort)))

const toggle = (off: Overlay, on: Overlay): Variants => [variant("none", off), variant("thinking", on)]

function budgets(
  model: Model.Info,
  support: Extract<Support, { type: "budget_tokens" }>,
  spell: (tokens: number) => Overlay,
): Variants {
  const maximum = Math.min(support.max ?? model.limit.output - 1, model.limit.output - 1)
  if (maximum <= 0) return []
  const high = Math.min(Math.max(support.min ?? 0, Math.floor((maximum + 1) / 2)), maximum)
  return [variant("high", spell(high)), variant("max", spell(maximum))]
}

const modelID = (model: Model.Info) => model.modelID ?? model.id

function claudeInfo(model: Model.Info) {
  const id = modelID(model)
  const familyFirst = /(?:claude-)?(opus|sonnet|haiku|fable|mythos)-(\d+)(?:[.-](\d+))?/i.exec(id)
  const versionFirst = /claude-(\d+)(?:[.-](\d+))?-(opus|sonnet|haiku|fable|mythos)/i.exec(id)
  const family = (familyFirst?.[1] ?? versionFirst?.[3])?.toLowerCase()
  const major = Number(familyFirst?.[2] ?? versionFirst?.[1])
  const minor = Number(familyFirst?.[3] ?? versionFirst?.[2] ?? 0)
  return {
    family,
    major,
    minor,
    manual: (major === 3 && minor === 7) || (major === 4 && minor < 6),
    always: family === "fable" || family === "mythos" || id.toLowerCase().includes("mythos-preview"),
  }
}

function manualThinking(model: Model.Info): Overlay | undefined {
  const tokens = Math.min(16_000, model.limit.output - 1)
  if (tokens < 1024) return
  return { settings: { thinking: { type: "enabled", budgetTokens: tokens } } }
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
  const info = claudeInfo(model)
  const opus45 = info.family === "opus" && info.major === 4 && info.minor === 5
  switch (support.type) {
    case "effort": {
      if (info.manual && !opus45) return anthropicMessages(model, { type: "budget_tokens", min: 1024 })
      const thinking = opus45 ? manualThinking(model) : { settings: { thinking: ADAPTIVE_THINKING } }
      if (!thinking) return []
      const defaults = info.major === 4 && info.minor === 6 ? [...EFFORTS, "max"] : [...EFFORTS, "xhigh", "max"]
      const values = support.values ?? defaults
      return efforts(values, (effort) => ({
        settings: { ...thinking.settings, effort },
      }))
    }
    case "toggle": {
      if (info.always) return []
      const thinking = info.manual ? manualThinking(model) : { settings: { thinking: ADAPTIVE_THINKING } }
      if (!thinking) return []
      return toggle({ settings: { thinking: { type: "disabled" } } }, thinking)
    }
    case "budget_tokens":
      return budgets(model, support, (tokens) => ({
        settings: { thinking: { type: "enabled", budgetTokens: tokens } },
      }))
  }
}

const minimaxMessages: Protocol = (model, support) => {
  if (/minimax[-.]?m2(?:[.-]|$)/i.test(modelID(model))) return []
  const configurable = support.type === "toggle" || (support.type === "effort" && support.values === undefined)
  if (!configurable) return []
  return toggle({ settings: { thinking: { type: "disabled" } } }, { settings: { thinking: { type: "adaptive" } } })
}

const moonshotMessages: Protocol = (model, support) => {
  if (support.type !== "effort" || /kimi[-.]?k2/i.test(modelID(model))) return []
  return efforts(support.values ?? ["low", "high", "max"], (effort) => ({ settings: { effort } }))
}

const alibabaMessages: Protocol = (model, support) => {
  const id = modelID(model).toLowerCase()
  switch (support.type) {
    case "effort": {
      const hosted = id.includes("glm") || id.includes("deepseek")
      const values = support.values ?? (hosted ? ["high", "max"] : ["low", "medium", "xhigh"])
      return efforts(values, (effort) => {
        if (effort === "none") return { settings: { thinking: { type: "disabled" } } }
        return { settings: { thinking: { type: "enabled" }, effort } }
      })
    }
    case "toggle":
      return toggle({ settings: { thinking: { type: "disabled" } } }, { settings: { thinking: { type: "enabled" } } })
    case "budget_tokens":
      return budgets(model, support, (tokens) => ({
        settings: { thinking: { type: "enabled", budgetTokens: tokens } },
      }))
  }
}

const zaiMessages: Protocol = (model, support) => {
  const id = modelID(model).toLowerCase()
  const forced = id.includes("glm-5.3") || id.includes("glm-5-3") || id.includes("glm-5p3")
  switch (support.type) {
    case "effort":
      return efforts(support.values ?? (forced ? ["low", "high", "max"] : ["high", "max"]), (effort) => ({
        settings: {
          thinking: { type: effort === "none" || effort === "minimal" ? "disabled" : "enabled" },
          effort,
        },
      }))
    case "toggle":
      return forced
        ? []
        : toggle({ settings: { thinking: { type: "disabled" } } }, { settings: { thinking: { type: "enabled" } } })
    case "budget_tokens":
      return []
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
            ...(claudeInfo(model).manual ? {} : { thinking: ADAPTIVE_THINKING }),
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
                ...(claudeInfo(model).manual ? {} : ADAPTIVE_THINKING),
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
              ...(claudeInfo(model).manual ? {} : { thinking: ADAPTIVE_THINKING }),
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
  "@opencode/ai/providers/alibaba/messages": alibabaMessages,
  "@opencode/ai/providers/meta/messages": anthropicMessages,
  "@opencode/ai/providers/minimax/messages": minimaxMessages,
  "@opencode/ai/providers/moonshot/messages": moonshotMessages,
  "@opencode/ai/providers/zai-coding-plan/messages": zaiMessages,

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
