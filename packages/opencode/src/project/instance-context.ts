import { LocalContext } from "@/util/local-context"
import { FSUtil } from "@opencode-ai/core/fs-util"
import type * as Project from "./project"

export interface InstanceContext {
  directory: string
  worktree: string
  project: Project.Info
}

export const context = LocalContext.create<InstanceContext>("instance")

/**
 * Check if a path is within the project boundary.
 * Returns true if path is inside ctx.directory OR ctx.worktree.
 * Paths within the worktree but outside the working directory should not trigger external_directory permission.
 */
/**
 * Kurum fork'u (Alp, 2026-09-28): izin sınırı Claude Code'daki gibi YALNIZ açılış dizinidir.
 * Git kökü (worktree) kapsamı genişletmez — `~/ansible/x`'te açılınca `~/ansible`'ın geri kalanı
 * dışarı sayılır ve external_directory izni sorulur. config/lsp gibi "proje sınırı" kullanımları
 * containsPath'te kalır; bu fonksiyon yalnız araç izin denetimi (external-directory, shell) içindir.
 */
export function insideWorkingDirectory(filepath: string, ctx: InstanceContext): boolean {
  return FSUtil.contains(ctx.directory, filepath)
}

export function containsPath(filepath: string, ctx: InstanceContext): boolean {
  if (FSUtil.contains(ctx.directory, filepath)) return true
  // Non-git projects set worktree to "/" which would match ANY absolute path.
  // Skip worktree check in this case to preserve external_directory permissions.
  if (ctx.worktree === "/") return false
  return FSUtil.contains(ctx.worktree, filepath)
}
