import { inflateSync } from "node:zlib";

function unescapePdfLiteral(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractTextOperators(content: string): string[] {
  const parts: string[] = [];
  const tj = /\(([^\\()]*(?:\\.[^\\()]*)*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tj.exec(content)) !== null) {
    const text = unescapePdfLiteral(match[1]).trim();
    if (text) parts.push(text);
  }
  const tjArray = /\[(.*?)\]\s*TJ/gs;
  while ((match = tjArray.exec(content)) !== null) {
    const inner = match[1];
    const lit = /\(([^\\()]*(?:\\.[^\\()]*)*)\)/g;
    let litMatch: RegExpExecArray | null;
    while ((litMatch = lit.exec(inner)) !== null) {
      const text = unescapePdfLiteral(litMatch[1]).trim();
      if (text) parts.push(text);
    }
  }
  return parts;
}

function decodeStream(dict: string, data: Buffer): string {
  let payload = data;
  if (/\/FlateDecode/.test(dict)) {
    try {
      payload = inflateSync(data);
    } catch {
      return "";
    }
  }
  return payload.toString("latin1");
}

/**
 * Extract readable text from a simple PDF (uncompressed or FlateDecode streams
 * with Tj/TJ operators). Enough for corpus ingest of local PDFs without a
 * native parser binary.
 */
export function extractPdfText(bytes: Buffer): string {
  const latin = bytes.toString("latin1");
  const parts: string[] = [];

  const streamRe = /(<<[\s\S]*?>>)\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(latin)) !== null) {
    const decoded = decodeStream(match[1], Buffer.from(match[2], "latin1"));
    parts.push(...extractTextOperators(decoded));
  }

  if (parts.length === 0) {
    parts.push(...extractTextOperators(latin));
  }

  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!text) {
    throw new Error("PDF contained no extractable text");
  }
  return text;
}

/** Uncompressed one-page PDF used as a fixture / test encoder. */
export function encodeSimplePdf(plainText: string): Buffer {
  const escaped = plainText.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const streamBody = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET\n`;
  const objs = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${streamBody.length} >>\nstream\n${streamBody}endstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objs) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += obj;
  }
  const xrefStart = Buffer.byteLength(body, "latin1");
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
