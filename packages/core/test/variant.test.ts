import { expect, test } from "bun:test"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { Variant } from "@opencode/core/variant"

const model = (packageName: string, modelID: string) => {
  const result = Model.Info.default(Provider.ID.make("test"), Model.ID.make(modelID)) as Model.MutableInfo
  result.package = packageName
  result.modelID = Model.ID.make(modelID)
  return Model.Info.make(result)
}

const resolve = (input: Model.Info, supports: readonly Variant.Support[]) =>
  Variant.resolve(input, supports).map((item) => ({ ...item, id: String(item.id) }))

test("spells Messages variants for each provider", () => {
  expect(
    resolve(model("@opencode/ai/providers/anthropic", "claude-opus-4-5"), [
      { type: "effort", values: ["low", "high"] },
      { type: "budget_tokens", min: 1024 },
    ]),
  ).toEqual([
    {
      id: "low",
      settings: { effort: "low", thinking: { type: "enabled", budgetTokens: 16_000 } },
    },
    {
      id: "high",
      settings: { effort: "high", thinking: { type: "enabled", budgetTokens: 16_000 } },
    },
  ])

  expect(
    resolve(model("@opencode/ai/providers/anthropic", "claude-opus-4-8"), [{ type: "effort", values: ["low", "max"] }]),
  ).toEqual([
    { id: "low", settings: { effort: "low", thinking: { type: "adaptive", display: "summarized" } } },
    { id: "max", settings: { effort: "max", thinking: { type: "adaptive", display: "summarized" } } },
  ])

  expect(resolve(model("@opencode/ai/providers/minimax/messages", "MiniMax-M3"), [{ type: "toggle" }])).toEqual([
    { id: "none", settings: { thinking: { type: "disabled" } } },
    { id: "thinking", settings: { thinking: { type: "adaptive" } } },
  ])

  expect(
    resolve(model("@opencode/ai/providers/moonshot/messages", "k3"), [
      { type: "toggle" },
      { type: "effort", values: ["low", "high", "max"] },
    ]),
  ).toEqual([
    { id: "low", settings: { effort: "low" } },
    { id: "high", settings: { effort: "high" } },
    { id: "max", settings: { effort: "max" } },
  ])

  expect(
    resolve(model("@opencode/ai/providers/alibaba/messages", "qwen3.8-max"), [
      { type: "toggle" },
      { type: "effort", values: ["low", "medium", "xhigh"] },
      { type: "budget_tokens", min: 1024, max: 262_144 },
    ]),
  ).toEqual([
    { id: "none", settings: { thinking: { type: "disabled" } } },
    { id: "low", settings: { effort: "low", thinking: { type: "enabled" } } },
    { id: "medium", settings: { effort: "medium", thinking: { type: "enabled" } } },
    { id: "xhigh", settings: { effort: "xhigh", thinking: { type: "enabled" } } },
  ])

  expect(
    resolve(model("@opencode/ai/providers/zai-coding-plan/messages", "glm-5.3"), [
      { type: "toggle" },
      { type: "effort", values: ["low", "high", "max"] },
      { type: "budget_tokens", min: 1024 },
    ]),
  ).toEqual([
    { id: "low", settings: { effort: "low", thinking: { type: "enabled" } } },
    { id: "high", settings: { effort: "high", thinking: { type: "enabled" } } },
    { id: "max", settings: { effort: "max", thinking: { type: "enabled" } } },
  ])
})

test("recognizes Claude version spellings and future models", () => {
  for (const id of ["claude-sonnet-3.7", "claude-sonnet-3-7", "claude-3.7-sonnet", "claude-3-7-sonnet"])
    expect(resolve(model("@opencode/ai/providers/anthropic", id), [{ type: "effort" }])).toEqual([
      { id: "high", settings: { thinking: { type: "enabled", budgetTokens: 16000 } } },
      { id: "max", settings: { thinking: { type: "enabled", budgetTokens: 31999 } } },
    ])

  expect(resolve(model("@opencode/ai/providers/anthropic", "claude-opus-6"), [{ type: "effort" }])).toEqual(
    ["low", "medium", "high", "xhigh", "max"].map((effort) => ({
      id: effort,
      settings: { effort, thinking: { type: "adaptive", display: "summarized" } },
    })),
  )
})
