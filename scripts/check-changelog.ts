/**
 * Checks the changelog entries in changelog/: valid YAML, the fields the app and the docs
 * read, both languages, Swiss spelling. Run by CI; `npm run check:changelog` locally.
 */
import { readChangelogFiles, validateEntry } from "../src/lib/changelog";

const files = readChangelogFiles();
let bad = 0;
for (const { file, raw, error } of files) {
  const errs = error ? [`not valid YAML: ${error}`] : validateEntry(file, raw);
  if (!errs.length) continue;
  bad++;
  for (const e of errs) console.error(`changelog/${file}: ${e}`);
}
if (bad) {
  console.error(`\n${bad} of ${files.length} changelog entries need fixing. Format: docs/contributing/changelog.md`);
  process.exit(1);
}
console.log(`${files.length} changelog entries OK`);
