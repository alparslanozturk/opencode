// maskele.ts — motordan BAĞIMSIZ çekirdek: audit hedefi (target) ve arama kapsamı yardımcıları.
// ADR-0005: opencode 1.x kanca adaptörü (../audit-log.ts) ve ileride 2.x adaptörü bu modülü paylaşır.
// Bu dosya plugins/lib/ altındadır: opencode yalnız plugins/*.ts'i eklenti diye yükler, alt dizini değil.
// 2026-09-28 (Alp): gizleme/maskeleme ve hassas dosya denylist'i KALDIRILDI — kurum içi offline sistem;
// dosya adı tarihsel (içe aktarmalar kırılmasın diye korunuyor).
import { isAbsolute, relative, resolve, dirname } from "path"

export const TARGET_MAX_LEN = 300

export function truncate(s: string, max = TARGET_MAX_LEN): string {
  return s.length > max ? s.slice(0, max) + "…" : s
}

// --- arama kapsamı (T13/A35, PERMISSION-MATRIX.md "arama kapsamı") -------------------------

export const SCOPE_TOOLS = new Set(["read", "glob", "grep", "list"])
export const SCOPE_BURST_WINDOW_MS = 2 * 60 * 1000
export const SCOPE_WIDE_DIR_THRESHOLD = 3

export function isInside(parentDir: string, candidate: string): boolean {
  const rel = relative(parentDir, candidate)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

export function resolveTargetDir(tool: string, args: Record<string, unknown>, baseDir: string): string | null {
  const raw =
    tool === "read" && typeof args.filePath === "string"
      ? dirname(args.filePath)
      : typeof args.path === "string"
        ? args.path
        : tool === "glob" || tool === "grep" || tool === "list"
          ? baseDir
          : null
  if (!raw) return null
  return isAbsolute(raw) ? raw : resolve(baseDir, raw)
}

export function deriveTarget(rawArgs: unknown): string {
  const args = (rawArgs ?? {}) as Record<string, unknown>
  const candidate =
    (typeof args.filePath === "string" && args.filePath) ||
    (typeof args.path === "string" && args.path) ||
    (typeof args.command === "string" && args.command) ||
    (typeof args.pattern === "string" && args.pattern) ||
    (typeof args.url === "string" && args.url) ||
    (typeof args.name === "string" && args.name) ||
    null
  // Maskeleme yok (Alp, 2026-09-28): kurum içi offline sistem — hedef olduğu gibi yazılır.
  if (candidate) return truncate(String(candidate))
  return truncate(JSON.stringify(args))
}
