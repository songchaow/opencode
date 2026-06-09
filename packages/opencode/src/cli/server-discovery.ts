export * as ServerDiscovery from "./server-discovery"

import { makeRuntime } from "@/effect/run-service"
import { ServerAuth } from "@/server/auth"
import { Global } from "@opencode-ai/core/global"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { readFileSync, unlinkSync } from "fs"
import { mkdir, readFile, unlink, writeFile } from "fs/promises"
import path from "path"

export const file = path.join(Global.Path.state, "server.json")

const Entry = Schema.Struct({
  url: Schema.String,
  pid: Schema.Number,
})
type Entry = typeof Entry.Type
const decodeEntry = Schema.decodeUnknownOption(Entry)

export interface Interface {
  readonly write: (url: URL) => Effect.Effect<void>
  readonly remove: () => Effect.Effect<void>
  readonly find: () => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/CliServerDiscovery") {}

export const layer = Layer.succeed(
  Service,
  Service.of({
    write: (url) => Effect.promise(() => writeEntry(url)),
    remove: () => Effect.promise(removeEntry),
    find: () =>
      Effect.gen(function* () {
        const entry = yield* Effect.promise(readEntry)
        if (!entry) return undefined
        const url = yield* healthy(entry.url)
        if (url) return url
        yield* Effect.promise(() => removeStale(entry))
        return undefined
      }),
  }),
)

export const defaultLayer = layer

const { runPromise } = makeRuntime(Service, defaultLayer)

export const write = (url: URL) => runPromise((discovery) => discovery.write(url))
export const remove = () => runPromise((discovery) => discovery.remove())
export const find = () => runPromise((discovery) => discovery.find())

export function removeSync() {
  const entry = readSync()
  if (entry?.pid !== process.pid) return
  try {
    unlinkSync(file)
  } catch {}
}

function readSync() {
  try {
    return Option.getOrUndefined(decodeEntry(JSON.parse(readFileSync(file, "utf8"))))
  } catch {
    return undefined
  }
}

async function readEntry() {
  try {
    return Option.getOrUndefined(decodeEntry(JSON.parse(await readFile(file, "utf8"))))
  } catch {
    return undefined
  }
}

async function writeEntry(url: URL) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ url: localURL(url).toString(), pid: process.pid }), { mode: 0o600 })
}

async function removeEntry() {
  const entry = await readEntry()
  if (entry?.pid !== process.pid) return
  try {
    await unlink(file)
  } catch {}
}

async function removeStale(entry: Entry) {
  const current = await readEntry()
  if (current?.pid !== entry.pid || current.url !== entry.url) return
  try {
    await unlink(file)
  } catch {}
}

function healthy(input: string) {
  return Effect.promise(async () => {
    try {
      const url = new URL(input)
      if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
      const response = await fetch(new URL("/global/health", url), {
        headers: ServerAuth.headers(),
        signal: AbortSignal.timeout(1000),
      })
      if (!response.ok) return undefined
      const body = (await response.json()) as unknown
      if (typeof body === "object" && body !== null && "healthy" in body && body.healthy === true) {
        return url.toString()
      }
      return undefined
    } catch {
      return undefined
    }
  })
}

function localURL(url: URL) {
  const result = new URL(url)
  if (result.hostname === "0.0.0.0") result.hostname = "127.0.0.1"
  if (result.hostname === "::") result.hostname = "::1"
  return result
}
