import { NamedError } from "@opencode-ai/core/util/error"
import { ConfigErrorV1 } from "@opencode-ai/core/v1/config/error"
import { Cause, Effect } from "effect"
import { HttpRouter, HttpServerError, HttpServerRespondable, HttpServerResponse } from "effect/unstable/http"
import { classifyDefect } from "./classify"

// Keep typed HttpApi failures on their declared error path; this boundary only replaces defect-only empty 500s.
export const errorLayer = HttpRouter.middleware<{ handles: unknown }>()((effect) =>
  effect.pipe(
    Effect.catchCause((cause) => {
      const defect = cause.reasons.filter(Cause.isDieReason).find((reason) => {
        if (HttpServerResponse.isHttpServerResponse(reason.defect)) return false
        if (HttpServerError.isHttpServerError(reason.defect)) return false
        if (HttpServerRespondable.isRespondable(reason.defect)) return false
        return true
      })
      if (!defect) return Effect.failCause(cause)

      const error = defect.defect
      if (
        ConfigErrorV1.JsonError.isInstance(error) ||
        ConfigErrorV1.InvalidError.isInstance(error) ||
        ConfigErrorV1.FrontmatterError.isInstance(error) ||
        ConfigErrorV1.DirectoryTypoError.isInstance(error) ||
        ConfigErrorV1.RemoteAuthError.isInstance(error)
      ) {
        return Effect.succeed(HttpServerResponse.jsonUnsafe(error.toObject(), { status: 400 }))
      }

      const ref = `err_${crypto.randomUUID().slice(0, 8)}`
      const log = Effect.logError("failed", { ref, error, cause: Cause.pretty(cause) })

      // Known defect shapes (provider / network / AI SDK) get a typed status and a
      // short reason instead of a blanket 500 — the full cause stays in the log.
      const classified = classifyDefect(error)
      if (classified)
        return log.pipe(
          Effect.as(
            HttpServerResponse.jsonUnsafe(
              {
                name: classified.name,
                data: {
                  message: `${classified.message} (ref: ${ref})`,
                  ref,
                  ...(classified.upstream !== undefined ? { upstream: classified.upstream } : {}),
                },
              },
              { status: classified.status },
            ),
          ),
        )

      return log.pipe(
        Effect.as(
          HttpServerResponse.jsonUnsafe(
            new NamedError.Unknown({
              message: `Unexpected server error. Check server logs for details. (ref: ${ref})`,
              ref,
            }).toObject(),
            { status: 500 },
          ),
        ),
      )
    }),
  ),
).layer
