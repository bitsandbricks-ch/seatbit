// Stand-in for next/headers outside a Next.js request: the test sets the
// signed-in account's session cookie in globalThis.__authz.cookie.
const ctx = () => (globalThis.__authz ??= { cookie: "" });

function parse() {
  const out = new Map();
  for (const part of ctx().cookie.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return out;
}

exports.headers = async function headers() {
  return new Headers({ cookie: ctx().cookie, host: "localhost:3000", origin: "http://localhost:3000", "user-agent": "authz-test" });
}

exports.cookies = async function cookies() {
  const jar = parse();
  const write = () => (ctx().cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
  return {
    get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    has: (name) => jar.has(name),
    // Actions may set cookies (language, sign-out); they don't change who is signed in for the next call.
    set: (name, value) => {
      if (typeof name === "object") ({ name, value } = name);
      jar.set(name, value);
    },
    delete: (name) => {
      jar.delete(typeof name === "object" ? name.name : name);
    },
    _write: write,
  };
}

exports.draftMode = async function draftMode() {
  return { isEnabled: false, enable() {}, disable() {} };
}
