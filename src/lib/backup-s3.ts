/**
 * The S3 and age side of the off-site copies (src/lib/backup-offsite.ts), without the database or
 * the settings, so it can be tested on its own. Talks to any S3-compatible store with signed
 * requests (aws4fetch), path-style.
 */
import fs from "node:fs";
import { Readable } from "node:stream";
import { Encrypter } from "age-encryption";
import { AwsClient } from "aws4fetch";

export type OffsiteConfig = {
  endpoint: string;
  bucket: string;
  region: string;
  prefix: string;
  publicKey: string;
  accessKey: string;
  secretKey: string;
};

/** Off-site copy names: the local backup name plus .age. */
export const REMOTE = /^seatbit-(\d{8})-(\d{6})\.db\.age$/;

const client = (c: OffsiteConfig) => new AwsClient({ accessKeyId: c.accessKey, secretAccessKey: c.secretKey, region: c.region, service: "s3" });
// Path-style (<endpoint>/<bucket>/<key>): every S3-compatible store understands it, not all do virtual hosts.
export const objectUrl = (c: OffsiteConfig, key: string) => `${c.endpoint}/${encodeURIComponent(c.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;

export async function s3(c: OffsiteConfig, url: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  const res = await client(c).fetch(url, { ...init, signal: AbortSignal.timeout(15 * 60_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1];
    const msg = /<Message>([^<]+)<\/Message>/.exec(body)?.[1];
    throw new Error(`S3 ${init.method ?? "GET"} answered ${res.status}${code ? ` ${code}` : ""}${msg ? `: ${msg}` : ""}`);
  }
  return res;
}

export type RemoteBackup = { key: string; name: string; size: number; at: Date };

/** Encrypted copies in the bucket under the prefix, newest first (by the time in the name). */
export async function listRemote(c: OffsiteConfig): Promise<RemoteBackup[]> {
  const out: RemoteBackup[] = [];
  let token: string | undefined;
  do {
    const q = new URLSearchParams({ "list-type": "2", prefix: c.prefix });
    if (token) q.set("continuation-token", token);
    const xml = await (await s3(c, `${c.endpoint}/${encodeURIComponent(c.bucket)}?${q}`)).text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = decodeXml(/<Key>([^<]*)<\/Key>/.exec(m[1])?.[1] ?? "");
      const name = key.slice(c.prefix.length);
      const t = REMOTE.exec(name);
      if (!t || name.includes("/")) continue;
      const at = new Date(`${t[1].slice(0, 4)}-${t[1].slice(4, 6)}-${t[1].slice(6)}T${t[2].slice(0, 2)}:${t[2].slice(2, 4)}:${t[2].slice(4)}Z`);
      out.push({ key, name, size: Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? 0), at });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? decodeXml(/<NextContinuationToken>([^<]*)</.exec(xml)?.[1] ?? "") || undefined : undefined;
  } while (token);
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

const decodeXml = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e === "lt" ? "<" : e === "gt" ? ">" : e === "amp" ? "&" : e === "quot" ? '"' : e === "apos" ? "'" : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)),
  );

/** Encrypts a local backup as a stream and uploads it. Returns the encrypted size. */
export async function uploadEncrypted(c: OffsiteConfig, file: string, key: string): Promise<number> {
  const e = new Encrypter();
  e.addRecipient(c.publicKey);
  // Streamed, so a large database isn't held in memory twice. age knows the encrypted size up front,
  // which S3 needs (Content-Length) for a single PUT.
  const plain = Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>;
  const enc = await e.encrypt(plain);
  const size = await enc.size(fs.statSync(file).size);
  await s3(c, objectUrl(c, key), {
    method: "PUT",
    body: enc,
    headers: { "Content-Length": String(size), "Content-Type": "application/octet-stream", "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD" },
  });
  // The store has it, at the full size (a cut-off stream would show here).
  const head = await s3(c, objectUrl(c, key), { method: "HEAD" });
  const stored = Number(head.headers.get("content-length"));
  if (stored !== size) throw new Error(`The bucket has ${stored} bytes of ${key}, expected ${size}`);
  return size;
}

/** Deletes copies older than the retention (`remote` newest first, from listRemote). The newest always stays. Returns the ones kept. */
export async function pruneRemote(c: OffsiteConfig, remote: RemoteBackup[], keepDays: number, now = Date.now()) {
  if (!keepDays || keepDays <= 0) return remote;
  const cutoff = now - keepDays * 86400_000;
  const [newest, ...older] = remote;
  const kept = newest ? [newest] : [];
  for (const r of older) {
    if (r.at.getTime() >= cutoff) {
      kept.push(r);
      continue;
    }
    try {
      await s3(c, objectUrl(c, r.key), { method: "DELETE" });
      console.log(`[backup] pruned off-site copy ${r.name}`);
    } catch (e) {
      kept.push(r);
      console.error("[backup] could not prune off-site copy %s", r.name, e);
    }
  }
  return kept;
}

