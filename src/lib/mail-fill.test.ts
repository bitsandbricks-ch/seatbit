import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMail, fill, renderMail } from "./mail-fill";

const links = { logoUrl: "https://example.com/logo.png", settingsUrl: "https://example.com/s", termsUrl: "https://example.com/t", privacyUrl: "https://example.com/p" };

test("fill replaces known placeholders and keeps unknown ones visible", () => {
  assert.equal(fill("Hi {firstName}, see {link}", { firstName: "Anna", link: "https://example.com" }), "Hi Anna, see https://example.com");
  assert.equal(fill("Typo {frstName}", { firstName: "Anna" }), "Typo {frstName}");
});

test("fill drops lines whose placeholders all came out empty", () => {
  assert.equal(fill("Event: {lan}\nSeat: {seat}\nBye", { lan: "Lakeside", seat: "" }), "Event: Lakeside\nBye");
  assert.equal(fill("Seat: {seat} in {lan}", { seat: " ", lan: "" }), "");
  // A line with one filled placeholder stays.
  assert.equal(fill("Seat: {seat} in {lan}", { seat: "", lan: "Lakeside" }), "Seat:  in Lakeside");
});

test("fill collapses the blank lines left behind", () => {
  assert.equal(fill("A\n\n{seat}\n\nB", { seat: "" }), "A\n\nB");
});

test("renderMail escapes what members wrote", () => {
  const { html } = renderMail({
    subject: "<b>Hi</b>",
    greeting: 'Hi <img src=x onerror="alert(1)">',
    body: "Bring <script>alert(1)</script> & snacks",
    facts: [["Note", '"><svg onload=alert(1)>']],
    header: "Clan <i>",
    ...links,
  });
  assert.ok(!html.includes("<script>alert"), "body script");
  assert.ok(!html.includes("<img src=x"), "greeting tag");
  assert.ok(!html.includes("<svg onload"), "fact tag");
  assert.ok(!html.includes("Clan <i>"), "header tag");
  assert.ok(html.includes("Bring &lt;script&gt;alert(1)&lt;/script&gt; &amp; snacks"));
});

test("renderMail links http(s) URLs only, without the full stop after them", () => {
  const { html } = renderMail({ subject: "s", greeting: "g", body: "See https://example.com/a?b=1. Not javascript:alert(1)", facts: [], header: "h", ...links });
  assert.ok(html.includes('<a href="https://example.com/a?b=1" target="_blank"'));
  assert.ok(!html.includes('href="javascript:'));
});

test("renderMail gives a plain-text part and a Discord text", () => {
  const { text, dm } = renderMail({
    subject: "s",
    greeting: "Hi Anna,",
    body: "Body",
    facts: [["Seat", "F7"]],
    button: { label: "Open [event]", url: "https://example.com/e" },
    header: "h",
    ...links,
  });
  assert.ok(text.startsWith("Hi Anna,\n\nBody\n\nSeat: F7\n\nOpen [event]: https://example.com/e"));
  // Brackets in the label would break the Markdown link.
  assert.ok(dm.includes("[Open event](https://example.com/e)"));
  assert.ok(dm.includes("**Seat:** F7"));
  assert.ok(!dm.includes("Hi Anna"));
});

test("buildMail leaves out empty facts and the button without a link", () => {
  const m = buildMail(
    { subject: "{lan}\nsoon", body: "Hello", button: "Open", note: "" },
    [["Event", "{lan}"], ["Seat", "{seat}"]],
    { lan: "Lakeside", seat: "", firstName: "" },
    { appUrl: "https://example.com" },
  );
  assert.equal(m.subject, "Lakeside soon");
  assert.ok(m.text.includes("Event: Lakeside"));
  assert.ok(!m.text.includes("Seat:"));
  assert.ok(!m.text.includes("Open:"));
});
