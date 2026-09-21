import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const modelsUrl = process.env.OPENCODE_MODELS_URL || "https://models.dev"
// Offline fallback: kuruma/sahaya ait ağsız makinelerde models.dev'e erişilemiyor.
// Sıra: MODELS_DEV_API_JSON (açık override) -> canlı fetch -> repodaki snapshot.
const snapshotPath = path.join(__dirname, "models-dev-api.json")

async function loadModels() {
  const override = process.env.MODELS_DEV_API_JSON
  if (override) return await Bun.file(override).text()

  try {
    const response = await fetch(`${modelsUrl}/api.json`, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const text = await response.text()
    JSON.parse(text) // kısmi/bozuk yanıtı sessizce ikiliye gömme
    return text
  } catch (error) {
    const snapshot = Bun.file(snapshotPath)
    if (!(await snapshot.exists())) throw error
    console.warn(`models.dev unreachable (${error}), falling back to snapshot ${snapshotPath}`)
    return await snapshot.text()
  }
}

export const modelsData = await loadModels()
console.log("Loaded models.dev snapshot")
