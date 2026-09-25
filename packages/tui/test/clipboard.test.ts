import { expect, test } from "bun:test"
import { copyCommand, copyOutcome, copyToast } from "../src/clipboard"

test("prefers Wayland clipboard when available", () => {
  expect(copyCommand("linux", true, (name) => name === "wl-copy")).toEqual(["wl-copy"])
})

test("uses osascript on macOS", () => {
  expect(copyCommand("darwin", false, (name) => name === "osascript")).toEqual(["osascript"])
})

test("falls back through X11 clipboard commands", () => {
  expect(copyCommand("linux", true, (name) => name === "xclip")).toEqual(["xclip", "-selection", "clipboard"])
  expect(copyCommand("linux", false, (name) => name === "xsel")).toEqual(["xsel", "--clipboard", "--input"])
})

test("returns undefined when native clipboard is unavailable", () => {
  expect(copyCommand("linux", false, () => false)).toBeUndefined()
})

test("copy outcome is honest: native > terminal (OSC 52, unverifiable) > failure", () => {
  expect(copyOutcome(true, true)).toBe("native")
  expect(copyOutcome(true, false)).toBe("native")
  expect(copyOutcome(false, true)).toBe("terminal")
  expect(() => copyOutcome(false, false)).toThrow(/no clipboard tool/)
})

test("toast does not claim success when only OSC 52 was sent", () => {
  expect(copyToast("native")).toEqual({ message: "Copied to clipboard", variant: "info" })
  expect(copyToast("terminal").variant).toBe("warning")
  expect(copyToast("terminal").message).toContain("OSC 52")
  // custom ClipboardService implementations may still resolve with nothing
  expect(copyToast(undefined).message).toBe("Copied to clipboard")
})
