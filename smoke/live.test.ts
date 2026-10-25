import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { planTask } from "@/lib/ai/tasks";
import { streamModel } from "@/lib/ai/stream";
import { toSections } from "@/lib/study/chunk";
import { isDuplicate, passesCheck, toItem } from "@/lib/study/items";
import { buildSteps, pickSetTitle } from "@/lib/study/lesson";
import { parseBeats } from "@/lib/study/beats";
import { createObjectParser, firstObject } from "@/lib/study/ndjson";
import type { Item } from "@/lib/study/types";

// Live check of the real prompts against ChatGPT (Codex). Opt-in:
//   SMOKE_CODEX_AUTH=~/.codex/auth.json pnpm smoke
// Uses a few requests on that account's plan. Never prints tokens.

const authPath = process.env.SMOKE_CODEX_AUTH;
const auth = authPath ? JSON.parse(readFileSync(authPath.replace(/^~/, process.env.HOME ?? ""), "utf8")) : null;
const tokens = auth && { accessToken: auth.tokens.access_token, refreshToken: auth.tokens.refresh_token, accountId: auth.tokens.account_id, expiresAt: Date.now() + 3_600_000 };

const NOTES = `# Cellular respiration
Cellular respiration releases energy from glucose in three main stages.

## Glycolysis
Glycolysis happens in the cytoplasm. It splits one glucose molecule into two pyruvate molecules, giving a net gain of two ATP and two NADH. It does not need oxygen.

## Krebs cycle
In the presence of oxygen, pyruvate enters the mitochondrial matrix and is converted to acetyl-CoA. Each turn of the Krebs cycle releases two molecules of carbon dioxide and produces NADH and FADH2, which carry electrons to the electron transport chain.

## Electron transport chain
The electron transport chain sits in the inner mitochondrial membrane. It pumps protons to build a gradient, and ATP synthase uses the flow of protons back across the membrane to make most of the cell's ATP. Oxygen is the final electron acceptor and forms water.`;

async function run(task: Parameters<typeof planTask>[0], input: unknown, model = "gpt-6-luna"): Promise<string> {
  const plan = planTask(task, input);
  const raw = await new Response(streamModel({ provider: "codex", tokens, model, ...plan })).text();
  let text = "";
  for (const line of raw.split("\n").filter(Boolean)) {
    const msg = JSON.parse(line);
    if (msg.e) throw new Error(msg.e);
    if (msg.t) text += msg.t;
  }
  return text;
}

it.skipIf(!tokens)("writes grounded questions, checks them and grades answers", async () => {
  const sections = toSections(NOTES);
  const started = Date.now();
  const text = await run("questions", { sections, count: 6, avoid: [] });
  const elapsed = Date.now() - started;
  const items: Item[] = [];
  let rawCount = 0;
  const parser = createObjectParser((v) => {
    rawCount++;
    const item = toItem(v, sections, `q${rawCount}`);
    if (item && !isDuplicate(item.prompt, items)) items.push(item);
  });
  parser.push(text);
  parser.flush();
  console.info(`[smoke] questions: ${rawCount} written, ${items.length} grounded, ${elapsed} ms`);
  expect(items.length).toBeGreaterThanOrEqual(4);

  const checks: Record<string, unknown>[] = [];
  const vText = await run("verify", { sections, items: items.map(({ id, kind, prompt, choices, answer, quote, section }) => ({ id, kind, prompt, choices, answer, quote, section })) });
  const vp = createObjectParser((v) => checks.push(v));
  vp.push(vText);
  vp.flush();
  const passed = items.filter((i) => checks.some((c) => passesCheck(i, c)));
  console.info(`[smoke] verify: ${checks.length} verdicts, ${passed.length}/${items.length} passed`);
  for (const i of items) console.info(`  ${passed.includes(i) ? "PASS" : "DROP"} [${i.kind}] ${i.prompt} -> ${i.answer}`);
  expect(passed.length).toBeGreaterThanOrEqual(3);

  const short = { id: "g", kind: "short" as const, prompt: "Why is oxygen needed for most ATP production?", answer: "Oxygen is the final electron acceptor in the electron transport chain, which makes most ATP.", quote: "Oxygen is the final electron acceptor and forms water.", section: 4, explain: "", concept: "", status: "ok" as const };
  const right = firstObject(await run("grade", { mode: "answer", prompt: short.prompt, answer: short.answer, quote: short.quote, response: "because it accepts the electrons at the end of the transport chain" }));
  const wrong = firstObject(await run("grade", { mode: "answer", prompt: short.prompt, answer: short.answer, quote: short.quote, response: "oxygen is used in glycolysis to split glucose" }));
  console.info(`[smoke] grade: right=${right?.verdict} wrong=${wrong?.verdict}`);
  expect(right?.verdict).toBe("right");
  expect(wrong?.verdict).toBe("wrong");

  const notes = await run("notes", { sections }, "gpt-6-astra");
  console.info(`[smoke] notes: ${notes.length} chars, cites=${(notes.match(/\[§\d/g) ?? []).length}`);
  expect(notes).toMatch(/\[§\d/);
}, 240_000);

it.skipIf(!tokens)("plans a lesson with gauge questions and teaches a step", async () => {
  const sections = toSections(NOTES);
  let started = Date.now();
  const raws: unknown[] = [];
  const text = await run("outline", { sections });
  const parser = createObjectParser((v) => raws.push(v));
  parser.push(text);
  parser.flush();
  let n = 0;
  const { steps, probes } = buildSteps(raws, sections, (p) => `${p}${++n}`);
  console.info(`[smoke] set title: ${pickSetTitle(raws)}`);
  console.info(`[smoke] outline: ${raws.length} written, ${steps.length} steps, ${probes.length} grounded probes, ${Date.now() - started} ms`);
  for (const s of steps) console.info(`  - ${s.title} [${s.sections.join(",")}]: ${s.goal}`);
  expect(steps.length).toBeGreaterThanOrEqual(2);
  expect(probes.length).toBeGreaterThanOrEqual(2);

  const step = steps.find((s) => /glycolysis/i.test(s.title)) ?? steps[0];
  const stepSections = sections.filter((s) => step.sections.includes(s.id));
  started = Date.now();
  const lesson = await run("teach", { sections: stepSections, title: step.title, goal: step.goal, familiarity: "new" }, "gpt-6-astra");
  const beats = parseBeats(lesson, true);
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  console.info(`[smoke] teach: ${beats.length} beats in ${Date.now() - started} ms`);
  for (const b of beats) console.info(`  [${b.kind}] ${b.label} (${b.mermaid ? "diagram" : `${words(b.body)} words`}): ${(b.mermaid ?? b.body).replace(/\s+/g, " ").slice(0, 110)}`);
  expect(beats.length).toBeGreaterThanOrEqual(3);
  expect(beats.every((b) => b.kind !== "text")).toBe(true);
  expect(beats.filter((b) => !b.mermaid).every((b) => words(b.body) <= 85)).toBe(true);

  const again = await run("teach", {
    sections: stepSections, title: step.title, goal: step.goal, familiarity: "new",
    retry: { prompt: "Where does glycolysis happen?", response: "in the mitochondria", answer: "In the cytoplasm", previous: lesson },
  }, "gpt-6-astra");
  const retryBeats = parseBeats(again, true);
  console.info(`[smoke] reteach: ${retryBeats.map((b) => b.label).join(" | ")}`);
  console.info(`  first: ${retryBeats[0]?.body.replace(/\s+/g, " ").slice(0, 200)}`);
  expect(retryBeats[0]?.kind).toBe("wrong");
}, 240_000);
