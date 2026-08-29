export type DeterministicCheckId =
  | "contains_fact"
  | "json_schema"
  | "citation_ids"
  | "length";

export type DeterministicCheckOutcome = {
  id: DeterministicCheckId;
  passed: boolean;
  detail: string;
};

export type DeterministicCheckInput = {
  subject: string;
  expectedFacts?: string[];
  jsonSchema?: { required?: string[] } | null;
  citationIds?: string[];
  minChars?: number;
  maxChars?: number;
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function checkContainsFact(
  subject: string,
  expectedFacts: string[],
): DeterministicCheckOutcome {
  if (expectedFacts.length === 0) {
    return {
      id: "contains_fact",
      passed: true,
      detail: "no expected facts provided",
    };
  }
  const haystack = normalize(subject);
  const missing = expectedFacts.filter((fact) => {
    const needle = normalize(fact);
    if (!needle) return false;
    return !haystack.includes(needle);
  });
  return {
    id: "contains_fact",
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? `all ${expectedFacts.length} expected fact(s) present`
        : `missing: ${missing.join(" | ")}`,
  };
}

export function checkJsonSchema(
  subject: string,
  schema?: { required?: string[] } | null,
): DeterministicCheckOutcome {
  if (!schema || !schema.required || schema.required.length === 0) {
    return {
      id: "json_schema",
      passed: true,
      detail: "no JSON schema provided",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(subject);
  } catch {
    return {
      id: "json_schema",
      passed: false,
      detail: "subject is not valid JSON",
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      id: "json_schema",
      passed: false,
      detail: "subject JSON is not an object",
    };
  }
  const record = parsed as Record<string, unknown>;
  const missing = schema.required.filter(
    (key) => record[key] === undefined,
  );
  return {
    id: "json_schema",
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? `required keys present: ${schema.required.join(", ")}`
        : `missing keys: ${missing.join(", ")}`,
  };
}

export function checkCitationIds(
  subject: string,
  citationIds: string[],
): DeterministicCheckOutcome {
  if (citationIds.length === 0) {
    return {
      id: "citation_ids",
      passed: true,
      detail: "no citation ids provided",
    };
  }
  const missing = citationIds.filter((id) => {
    const token = id.trim();
    if (!token) return false;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `\\[\\s*${escaped}\\s*\\]|\\(\\s*${escaped}\\s*\\)|#${escaped}\\b`,
    );
    return !pattern.test(subject);
  });
  return {
    id: "citation_ids",
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? `all citation ids present`
        : `missing citations: ${missing.join(", ")}`,
  };
}

export function checkLength(
  subject: string,
  bounds: { minChars?: number; maxChars?: number } = {},
): DeterministicCheckOutcome {
  const length = subject.trim().length;
  const min = bounds.minChars;
  const max = bounds.maxChars;
  let passed = true;
  const parts = [`${length} chars`];
  if (typeof min === "number" && length < min) {
    passed = false;
    parts.push(`min ${min}`);
  }
  if (typeof max === "number" && length > max) {
    passed = false;
    parts.push(`max ${max}`);
  }
  return { id: "length", passed, detail: parts.join("; ") };
}

export function runDeterministicChecks(
  input: DeterministicCheckInput,
): DeterministicCheckOutcome[] {
  return [
    checkContainsFact(input.subject, input.expectedFacts ?? []),
    checkJsonSchema(input.subject, input.jsonSchema),
    checkCitationIds(input.subject, input.citationIds ?? []),
    checkLength(input.subject, {
      minChars: input.minChars,
      maxChars: input.maxChars,
    }),
  ];
}

export function parseDeterministicInput(body: unknown): DeterministicCheckInput | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.subject !== "string") return null;
  const expectedFacts: string[] = [];
  if (Array.isArray(record.expectedFacts)) {
    expectedFacts.push(
      ...record.expectedFacts.filter((item): item is string => typeof item === "string"),
    );
  } else if (typeof record.reference === "string" && record.reference.trim()) {
    expectedFacts.push(
      ...record.reference
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    );
  }
  let jsonSchema: { required?: string[] } | null = null;
  if (record.jsonSchema && typeof record.jsonSchema === "object") {
    jsonSchema = record.jsonSchema as { required?: string[] };
  }
  const citationIds = Array.isArray(record.citationIds)
    ? record.citationIds.filter((item): item is string => typeof item === "string")
    : [];
  const minChars =
    typeof record.minChars === "number" ? record.minChars : undefined;
  const maxChars =
    typeof record.maxChars === "number" ? record.maxChars : undefined;
  return {
    subject: record.subject,
    expectedFacts,
    jsonSchema,
    citationIds,
    minChars,
    maxChars,
  };
}
