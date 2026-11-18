import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { Decrypter, generateX25519Identity, identityToRecipient } from "age-encryption";
import { type OffsiteConfig, listRemote, pruneRemote, uploadEncrypted } from "./backup-s3";

// A tiny in-memory S3 (path-style PUT, HEAD, GET, DELETE and ListObjectsV2): enough to check what we send.
const objects = new Map<string, Buffer>();
const puts: { key: string; contentLength?: string; auth?: string }[] = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const [, bucket, ...rest] = url.pathname.split("/").map(decodeURIComponent);
  const key = rest.join("/");
  if (bucket !== "seatbit-test") return void res.writeHead(404).end("<Error><Code>NoSuchBucket</Code></Error>");
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    if (req.method === "PUT") {
      puts.push({ key, contentLength: req.headers["content-length"], auth: req.headers.authorization });
      objects.set(key, Buffer.concat(chunks));
      return void res.writeHead(200).end();
    }
    if (req.method === "DELETE") {
      objects.delete(key);
      return void res.writeHead(204).end();
    }
    if (!key && url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const items = [...objects].filter(([k]) => k.startsWith(prefix));
      const xml = `<ListBucketResult><IsTruncated>false</IsTruncated>${items.map(([k, v]) => `<Contents><Key>${k}</Key><Size>${v.length}</Size></Contents>`).join("")}</ListBucketResult>`;
      return void res.writeHead(200, { "content-type": "application/xml" }).end(xml);
    }
    const obj = objects.get(key);
    if (!obj) return void res.writeHead(404).end("<Error><Code>NoSuchKey</Code></Error>");
    res.writeHead(200, { "content-length": obj.length });
    res.end(req.method === "HEAD" ? undefined : obj);
  });
});

let c: OffsiteConfig;
let identity: string;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seatbit-s3-test-"));

before(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  identity = await generateX25519Identity();
  c = {
    endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    bucket: "seatbit-test",
    region: "us-east-1",
    prefix: "seatbit/",
    publicKey: await identityToRecipient(identity),
    accessKey: "AKIAEXAMPLE",
    secretKey: "example-secret",
  };
});
after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("uploads an encrypted copy that only the private key opens", async () => {
  const plain = Buffer.from("SQLite format 3\0".padEnd(200_000, "x"));
  const file = path.join(dir, "seatbit-20261118-030000.db");
  fs.writeFileSync(file, plain);
  const size = await uploadEncrypted(c, file, "seatbit/seatbit-20261118-030000.db.age");

  const stored = objects.get("seatbit/seatbit-20261118-030000.db.age")!;
  assert.equal(stored.length, size);
  assert.equal(puts.at(-1)?.contentLength, String(size));
  assert.match(puts.at(-1)?.auth ?? "", /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\//);
  assert.ok(stored.subarray(0, 21).toString().startsWith("age-encryption.org/v1"));
  assert.equal(stored.includes(Buffer.from("SQLite format 3")), false);

  const d = new Decrypter();
  d.addIdentity(identity);
  assert.deepEqual(Buffer.from(await d.decrypt(new Uint8Array(stored))), plain);

  const other = new Decrypter();
  other.addIdentity(await generateX25519Identity());
  await assert.rejects(other.decrypt(new Uint8Array(stored)));
});

test("lists only our copies, newest first, and prunes old ones but keeps the newest", async () => {
  objects.clear();
  for (const k of [
    "seatbit/seatbit-20261001-030000.db.age",
    "seatbit/seatbit-20261110-030000.db.age",
    "seatbit/seatbit-20261117-030000.db.age",
    "seatbit/notes.txt",
    "seatbit/sub/seatbit-20261117-040000.db.age",
    "other/seatbit-20261117-030000.db.age",
  ])
    objects.set(k, Buffer.from("x"));

  const list = await listRemote(c);
  assert.deepEqual(
    list.map((r) => r.name),
    ["seatbit-20261117-030000.db.age", "seatbit-20261110-030000.db.age", "seatbit-20261001-030000.db.age"],
  );
  assert.equal(list[0].at.toISOString(), "2026-11-17T03:00:00.000Z");

  const now = Date.parse("2026-11-18T03:00:00Z");
  const kept = await pruneRemote(c, list, 14, now);
  assert.deepEqual(
    kept.map((r) => r.name),
    ["seatbit-20261117-030000.db.age", "seatbit-20261110-030000.db.age"],
  );
  assert.equal(objects.has("seatbit/seatbit-20261001-030000.db.age"), false);
  assert.equal(objects.has("seatbit/notes.txt"), true);

  // The newest stays even when it is older than the retention; 0 keeps everything.
  const onlyNewest = await pruneRemote(c, await listRemote(c), 1, Date.parse("2027-01-01T00:00:00Z"));
  assert.deepEqual(onlyNewest.map((r) => r.name), ["seatbit-20261117-030000.db.age"]);
  assert.equal((await pruneRemote(c, await listRemote(c), 0)).length, 1);
});

test("reports the store's error code", async () => {
  await assert.rejects(listRemote({ ...c, bucket: "missing-bucket" }), /404 NoSuchBucket/);
});
