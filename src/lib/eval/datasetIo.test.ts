import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatasetItemRecord } from "../db/datasetObject";
import {
  exportGoldCsv,
  exportGoldJsonl,
  parseCsvRecords,
  parseGoldCsv,
  parseGoldJsonl,
} from "./datasetIo";

function goldItem(facts: string[]): DatasetItemRecord {
  return {
    id: "item-multi-fact",
    datasetId: "dataset-1",
    versionId: "version-1",
    ordinal: 0,
    question: "When does the unit whale glow, and what color?",
    expectedFacts: facts,
    difficulty: "medium",
    sourceSlug: "unit-whale",
    promptHash: "abc123prompt",
    model: "test-synth-model",
    reviewStatus: "kept",
    isGold: true,
    createdAt: "2026-08-28T12:00:00.000Z",
    reviewedAt: "2026-08-28T12:01:00.000Z",
  };
}

test("parseCsvRecords keeps quoted embedded newlines as one record", () => {
  const csv = 'a,b\n"x\ny",z\n';
  const records = parseCsvRecords(csv);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], ["a", "b"]);
  assert.deepEqual(records[1], ["x\ny", "z"]);
});

test("JSONL and CSV round-trip preserve two expected facts plus metadata", () => {
  const facts = [
    "It glows blue at dusk.",
    "The unit whale is a fictional species.",
  ];
  const item = goldItem(facts);
  assert.ok(item.expectedFacts.length >= 2);

  const jsonl = exportGoldJsonl([item]);
  const csv = exportGoldCsv([item]);
  assert.ok(
    csv.includes(`"${facts.join("\n")}"`),
    "CSV must quote the reference field with an embedded newline between facts",
  );
  assert.ok(
    csv.includes("It glows blue at dusk."),
    "exported CSV must contain the first fact",
  );
  assert.ok(
    csv.includes("The unit whale is a fictional species."),
    "exported CSV must contain the second fact",
  );

  const parsedJsonl = parseGoldJsonl(jsonl);
  const parsedCsv = parseGoldCsv(csv);
  assert.equal(parsedJsonl.length, 1, "JSONL must stay one row");
  assert.equal(parsedCsv.length, 1, "CSV must stay one row despite quoted newlines");

  for (const row of [parsedJsonl[0], parsedCsv[0]]) {
    assert.equal(row.context, item.question);
    assert.equal(row.question, item.question);
    assert.deepEqual(row.expected_facts, facts);
    assert.equal(row.reference, facts.join("\n"));
    assert.equal(row.source_slug, item.sourceSlug);
    assert.equal(row.prompt_hash, item.promptHash);
    assert.equal(row.model, item.model);
    assert.equal(row.created_at, item.createdAt);
    assert.equal(row.difficulty, item.difficulty);
  }
});
