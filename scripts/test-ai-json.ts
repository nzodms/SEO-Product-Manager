import { safeParseAIJson, extractJsonText } from "../src/lib/agents/json";
import { ProductTitleSchema, MetaSeoSchema } from "../src/lib/agents/schemas";

let failures = 0;
function assert(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

console.log("safeParseAIJson / extractJsonText");

// 1. Plain valid JSON.
const r1 = safeParseAIJson('{"title":"Lustre Cristal Salon","brandedName":"Aurélia"}', ProductTitleSchema);
assert("valid JSON parses + validates", r1.ok && r1.data.title === "Lustre Cristal Salon");

// 2. Markdown-fenced JSON.
const r2 = safeParseAIJson('```json\n{"title":"X","brandedName":null}\n```', ProductTitleSchema);
assert("fenced JSON parses", r2.ok && r2.data.title === "X");

// 3. JSON with surrounding prose.
const r3 = safeParseAIJson('Voici le JSON : {"title":"Y"} merci', ProductTitleSchema);
assert("prose-wrapped JSON parses", r3.ok && r3.data.title === "Y");

// 4. The reported failure: unterminated string.
const broken = '{"title": "Lustre Cristal pour salon avec finition';
const r4 = safeParseAIJson(broken, ProductTitleSchema);
assert("unterminated string fails gracefully", !r4.ok);
assert("failure carries an error + excerpt", !r4.ok && r4.error.length > 0 && r4.excerpt.length > 0);

// 5. Valid JSON but schema-invalid (missing required field).
const r5 = safeParseAIJson('{"seoTitle":"only title"}', MetaSeoSchema);
assert("schema rejects missing seoDescription", !r5.ok);

// 6. Defaults applied for optional fields.
const r6 = safeParseAIJson('{"title":"Z"}', ProductTitleSchema);
assert("optional brandedName defaults to null", r6.ok && r6.data.brandedName === null);

// 7. extractJsonText strips fences/prose.
assert("extractJsonText strips fences", extractJsonText('```json\n{"a":1}\n```') === '{"a":1}');

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log("\nAll AI-JSON tests passed.");
