import { describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer, LayerMap } from "effect"
import type { Agent } from "../../src/agent/agent"
import { NamedError } from "@opencode-ai/core/util/error"
import { Skill } from "../../src/skill"
import { Permission } from "../../src/permission"
import type { Provider } from "../../src/provider/provider"
import { SystemPrompt } from "../../src/session/system"
import { MCP } from "../../src/mcp"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import type { LocationError, LocationServices } from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { Reference } from "@opencode-ai/core/reference"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { InstanceRef } from "../../src/effect/instance-ref"
import type { InstanceContext } from "../../src/project/instance-context"
import { testEffect } from "../lib/effect"

const skills: Skill.Info[] = [
  {
    name: "zeta-skill",
    description: "Zeta skill.",
    location: "/tmp/zeta-skill/SKILL.md",
    content: "# zeta-skill",
  },
  {
    name: "alpha-skill",
    description: "Alpha skill.",
    location: "/tmp/alpha-skill/SKILL.md",
    content: "# alpha-skill",
  },
  {
    name: "middle-skill",
    description: "Middle skill.",
    location: "/tmp/middle-skill/SKILL.md",
    content: "# middle-skill",
  },
  {
    name: "manual-skill",
    location: "/tmp/manual-skill/SKILL.md",
    content: "# manual-skill",
  },
]

const build: Agent.Info = {
  name: "build",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
}

// Bozuk girdi senaryosu (saha err_1fe00c62): Reference.list() çıktısına tanımsız
// ya da eksik alanlı kayıt sızabiliyordu; ortam bloğu bunları atlayabilmeli.
let referenceList: unknown[] = []

const ctx = {
  directory: "/tmp/test-dir",
  worktree: "/tmp/test-dir",
  project: { id: "proj-1", worktree: "/tmp/test-dir" },
} as InstanceContext

const validReference = new Reference.Info({
  name: "valid-ref",
  path: AbsolutePath.make("/tmp/valid-ref"),
  description: "A valid reference",
  source: Reference.LocalSource.make({
    type: "local",
    path: AbsolutePath.make("/tmp/valid-ref"),
    description: "A valid reference",
  }),
})

// LayerMap mock'u: get(ref) yalnız Reference.Service sağlayan bir katman döner.
// Layer, Success tipinde değişmezdir (invariant); get'in beklediği tam
// LocationServices birliğine ve servisin kendisi LayerMap arayüzüne cast gerekir.
const locationMapMock = Layer.succeed(
  LocationServiceMap.Service,
  {
    get: () =>
      Layer.mock(Reference.Service, {
        list: () => Effect.succeed(referenceList as Reference.Info[]),
      }) as unknown as Layer.Layer<LocationServices, LocationError>,
  } as unknown as LayerMap.LayerMap<Location.Ref, LocationServices, LocationError>,
)

const it = testEffect(
  LayerNode.compile(SystemPrompt.node, [
    [
      MCP.node,
      Layer.mock(MCP.Service, {
        instructions: () =>
          Effect.succeed([
            {
              name: "guide-server",
              instructions: "Use lookup before mutate.",
              tools: [],
            },
            {
              name: "tool-server",
              instructions: "Prefer search before update.",
              tools: ["tool-server_search", "tool-server_update"],
            },
          ]),
      }),
    ],
    [
      Skill.node,
      Layer.succeed(
        Skill.Service,
        Skill.Service.of({
          get: (name) => Effect.succeed(skills.find((skill) => skill.name === name)),
          require: (name) => {
            const info = skills.find((skill) => skill.name === name)
            if (info) return Effect.succeed(info)
            return Effect.fail(new Skill.NotFoundError({ name, available: skills.map((skill) => skill.name) }))
          },
          all: () => Effect.succeed(skills),
          dirs: () => Effect.succeed([]),
          available: () => Effect.succeed(skills),
        }),
      ),
    ],
    [
      LocationServiceMap.node,
      locationMapMock,
    ],
  ]),
)

describe("session.system", () => {
  test("selects the Meta prompt for Muse Spark model IDs", () => {
    for (const id of ["meta/muse-spark-preview", "muse-spark-1.1", "muse-spark-1.2"]) {
      const prompt = SystemPrompt.provider({ api: { id } } as Provider.Model)[0]
      expect(prompt).toContain("powered by Muse Spark,")
      expect(prompt).toContain("using Meta Muse Spark.")
      expect(prompt).not.toContain("{{MODEL_NAME}}")
    }
  })

  test("selects the Meta prompt for Muse Glimmer model IDs", () => {
    for (const id of ["meta/muse-glimmer", "meta/muse-glimmer-30b", "muse-glimmer-30b"]) {
      const prompt = SystemPrompt.provider({ api: { id } } as Provider.Model)[0]
      expect(prompt).toContain("powered by Muse Glimmer,")
      expect(prompt).toContain("using Meta Muse Glimmer.")
      expect(prompt).not.toContain("{{MODEL_NAME}}")
    }
  })

  test("selects the Kimi prompt for official provider model IDs", () => {
    for (const providerID of ["kimi-for-coding", "moonshotai", "moonshotai-cn"]) {
      const prompt = SystemPrompt.provider({ providerID, api: { id: "k3" } } as Provider.Model)[0]
      expect(prompt).toContain("# Prompt and Tool Use")
    }
  })

  it.effect("skills output is sorted by name and stable across calls", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const first = yield* prompt.skills(build)
      const second = yield* prompt.skills(build)
      const output = first ?? (yield* Effect.fail(new NamedError.Unknown({ message: "missing skills output" })))

      expect(first).toBe(second)

      const alpha = output.indexOf("<name>alpha-skill</name>")
      const middle = output.indexOf("<name>middle-skill</name>")
      const zeta = output.indexOf("<name>zeta-skill</name>")

      expect(alpha).toBeGreaterThan(-1)
      expect(middle).toBeGreaterThan(alpha)
      expect(zeta).toBeGreaterThan(middle)
      expect(output).not.toContain("manual-skill")
    }),
  )

  it.effect("MCP output includes connected server instructions", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(build)

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          '  <server name="tool-server">',
          "    Prefer search before update.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )

  it.effect("MCP output omits servers when all advertised tools are denied", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(build, Permission.fromConfig({ "tool-server_*": "deny" }))

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )

  it.effect("environment skips reference entries with missing fields instead of crashing", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      referenceList = [{ description: "ghost" }, validReference]
      const output = yield* prompt
        .environment({ providerID: "test", api: { id: "test/model" } } as Provider.Model)
        .pipe(Effect.provideService(InstanceRef, ctx))

      const refs = output[1]
      expect(refs).toBeDefined()
      expect(refs).toContain("<name>valid-ref</name>")
      expect(refs).toContain("<path>/tmp/valid-ref</path>")
      expect(refs).toContain("A valid reference")
      expect(refs).not.toContain("ghost")
      expect(refs.match(/<name>/g)).toHaveLength(1)
    }),
  )

  it.effect("environment skips undefined reference entries instead of crashing", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      referenceList = [undefined, validReference]
      const output = yield* prompt
        .environment({ providerID: "test", api: { id: "test/model" } } as Provider.Model)
        .pipe(Effect.provideService(InstanceRef, ctx))

      const refs = output[1]
      expect(refs).toBeDefined()
      expect(refs).toContain("<name>valid-ref</name>")
      expect(refs).not.toContain("undefined")
      expect(refs.match(/<name>/g)).toHaveLength(1)
    }),
  )
})
