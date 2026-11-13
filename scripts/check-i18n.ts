/**
 * Flags UI text that doesn't go through t(): JSX text, user-facing string attributes
 * (title, label, placeholder, ...) and confirm()/alert() messages in .tsx files.
 *
 *   npm run check:i18n
 *
 * Names that stay the same in every language (Seatbit, Discord, WhatsApp, ...) are allowed.
 * Mark a deliberate exception with an `i18n-ignore` comment on the same line, or a whole file that
 * holds one version per language (the legal pages) with `i18n-ignore-file`.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.join(import.meta.dirname, "..", "src");
const ATTRS = new Set([
  "title", "label", "placeholder", "aria-label", "alt", "subtitle", "description", "hint",
  "eyebrow", "empty", "sub", "submitLabel", "confirm", "text", "heading", "tooltip", "noun",
]);
// Words that read the same in English and German.
const SAME = new Set([
  "Seatbit", "Discord", "WhatsApp", "Steam", "Stripe", "TWINT", "Google", "LAN", "LANs", "ID", "CSV", "SMTP",
  "OK", "Ok", "s", "Admin", "Lead", "Leads", "Events", "Event", "Clan", "Clans", "Nick", "Nicks", "Tickets", "Ticket",
  "Supporter", "Recruiter", "GB", "DELETE", "Socials", "Status", "Name", "Details", "bitsandbricks", "ch", "Pixel", "Pirates",
]);

function isText(raw: string) {
  // URLs, slash commands and HTML entities aren't words to translate.
  const s = raw.replace(/https?:\/\/\S*|\/[a-z]+(\s[a-z]+)?\b|&[a-z]+;/g, " ");
  const words = s.match(/[A-Za-zÄÖÜäöü][A-Za-zÄÖÜäöü'’]+/g) ?? [];
  // ALL-CAPS words are acronyms or env vars (SMTP, TZ, BETTER_AUTH_URL).
  return words.some((w) => !SAME.has(w) && w !== w.toUpperCase());
}

type Hit = { file: string; line: number; text: string };
const hits: Hit[] = [];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  // Long texts written out once per language (legal pages).
  if (src.includes("i18n-ignore-file")) continue;
  const lines = src.split("\n");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const report = (node: ts.Node, text: string) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
    if (lines[line]?.includes("i18n-ignore") || lines[line - 1]?.includes("i18n-ignore")) return;
    if (!isText(text)) return;
    hits.push({ file: path.relative(process.cwd(), file), line: line + 1, text: text.trim().slice(0, 80) });
  };
  const literalText = (e: ts.Expression | undefined): string | null => {
    if (!e) return null;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isTemplateExpression(e)) return [e.head.text, ...e.templateSpans.map((s) => s.literal.text)].join(" ");
    return null;
  };
  // Strings that end up as text: direct children of {...} in JSX, also through ?:, && and ??.
  const textParts = (e: ts.Expression): ts.Expression[] => {
    if (ts.isParenthesizedExpression(e)) return textParts(e.expression);
    if (ts.isConditionalExpression(e)) return [...textParts(e.whenTrue), ...textParts(e.whenFalse)];
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind))
      return [...textParts(e.left), ...textParts(e.right)];
    return [e];
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const tag = ts.isJsxElement(node.parent) ? node.parent.openingElement.tagName.getText(sf) : "";
      if (node.text.trim() && tag !== "code" && tag !== "kbd") report(node, node.text);
    } else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      for (const p of textParts(node.expression)) {
        const s = literalText(p);
        if (s !== null) report(p, s);
      }
    } else if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText(sf)) && node.initializer) {
      const init = node.initializer;
      if (ts.isStringLiteral(init)) report(init, init.text);
      else if (ts.isJsxExpression(init) && init.expression)
        for (const p of textParts(init.expression)) {
          const s = literalText(p);
          if (s !== null) report(p, s);
        }
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["confirm", "alert", "prompt"].includes(node.expression.text)) {
      const s = literalText(node.arguments[0]);
      if (s !== null) report(node, s);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

for (const h of hits) console.log(`${h.file}:${h.line}  ${h.text}`);
if (hits.length) {
  console.error(`\n${hits.length} untranslated text(s). Use t() with keys in src/i18n/messages/en/ and de/, or mark a deliberate exception with // i18n-ignore.`);
  process.exit(1);
}
console.log("No untranslated text found.");
