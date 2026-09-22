export * as Reference from "./reference"

import { makeLocationNode } from "./effect/app-node"
import { Context, Effect, Layer, Scope, Types } from "effect"
import { Reference } from "@opencode-ai/schema/reference"
import { Global } from "./global"
import { EventV2 } from "./event"
import { Repository } from "./repository"
import { RepositoryCache } from "./repository-cache"
import { AbsolutePath } from "./schema"
import { State } from "./state"

export const LocalSource = Reference.LocalSource
export type LocalSource = Reference.LocalSource

export const GitSource = Reference.GitSource
export type GitSource = Reference.GitSource

export const Source = Reference.Source
export type Source = Reference.Source

export const Event = Reference.Event

export const Info = Reference.Info
export type Info = Reference.Info

type Data = {
  sources: Map<string, Types.DeepMutable<Source>>
}

type Draft = {
  add(name: string, source: Source): void
  remove(name: string): void
  list(): readonly [string, Source][]
}

export interface Interface extends State.Transformable<Draft> {
  readonly list: () => Effect.Effect<Info[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/Reference") {}

/**
 * DAR YAMA (vendor): saha err_1fe00c62 — bozuk bir reference girdisi (eski/bozuk
 * config veya plugin dönüşümü) draft'a geçersiz kayıt ekleyebiliyor; materialized
 * list'ine tanımsız kayıt sızarsa system prompt ortamı (a.name) tüm istemciyi
 * çökertiyordu. Kaydı burada uyarıyla ele.
 */
function invalidSource(source: unknown): boolean {
  if (typeof source !== "object" || source === null) return true
  const record = source as { type?: unknown; repository?: unknown; path?: unknown }
  if (record.type === "local") return typeof record.path !== "string"
  if (record.type === "git") return typeof record.repository !== "string"
  return true
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const global = yield* Global.Service
    const events = yield* EventV2.Service
    const cache = yield* RepositoryCache.Service
    const scope = yield* Scope.Scope
    const materialized = new Map<string, Info>()
    const state = State.create<Data, Draft>({
      initial: () => ({ sources: new Map() }),
      draft: (draft) => ({
        add: (name, source) => draft.sources.set(name, source as Types.DeepMutable<Source>),
        remove: (name) => draft.sources.delete(name),
        list: () => Array.from(draft.sources.entries()) as [string, Source][],
      }),
      finalize: (draft) =>
        Effect.gen(function* () {
          materialized.clear()
          for (const [name, source] of draft.list()) {
            if (invalidSource(source)) {
              yield* Effect.logWarning("skipping invalid reference", { name })
              continue
            }
            if (source.type === "local") {
              materialized.set(
                name,
                new Info({
                  name,
                  path: source.path,
                  ...(source.description === undefined ? {} : { description: source.description }),
                  ...(source.hidden === undefined ? {} : { hidden: source.hidden }),
                  source,
                }),
              )
              continue
            }
            const repository = Repository.parse(source.repository)
            if (!repository || !Repository.isRemote(repository)) {
              yield* Effect.logWarning("skipping reference with invalid repository", {
                name,
                repository: source.repository,
              })
              continue
            }
            if (source.branch) {
              try {
                Repository.validateBranch(source.branch)
              } catch {
                yield* Effect.logWarning("skipping reference with invalid branch", {
                  name,
                  branch: source.branch,
                })
                continue
              }
            }
            materialized.set(
              name,
              new Info({
                name,
                path: AbsolutePath.make(Repository.cachePath(global.repos, repository, source.branch)),
                ...(source.description === undefined ? {} : { description: source.description }),
                ...(source.hidden === undefined ? {} : { hidden: source.hidden }),
                source,
              }),
            )
            yield* cache.ensure({ reference: repository, branch: source.branch, refresh: true }).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("failed to materialize reference", {
                  name,
                  repository: source.repository,
                  cause,
                }),
              ),
              Effect.forkIn(scope),
            )
          }
          yield* events.publish(Event.Updated, {})
        }),
    })

    return Service.of({
      transform: state.transform,
      reload: state.reload,
      list: Effect.fn("Reference.list")(function* () {
        return Array.from(materialized.values())
      }),
    })
  }),
)

export const locationLayer = layer

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Global.node, EventV2.node, RepositoryCache.node],
})
