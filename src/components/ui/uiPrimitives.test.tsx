import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "node:test";
import { Badge } from "./badge";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Select } from "./select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { Textarea } from "./textarea";
import { PassFailBadge } from "../PassFailBadge";
import { DashboardShell } from "../DashboardShell";

describe("UI primitives (Radix + theme wrappers)", () => {
  test("Button renders a real button with accessible label", () => {
    const html = renderToStaticMarkup(
      createElement(Button, { type: "submit" }, "Evaluate"),
    );
    assert.match(html, /<button[^>]*type="submit"/);
    assert.match(html, /Evaluate/);
  });

  test("Input and Textarea keep name/id for form wiring", () => {
    const input = renderToStaticMarkup(
      createElement(Input, {
        id: "judge-model",
        name: "judgeModel",
        defaultValue: "grok-test",
      }),
    );
    assert.match(input, /<input[^>]*id="judge-model"/);
    assert.match(input, /name="judgeModel"/);

    const area = renderToStaticMarkup(
      createElement(Textarea, {
        id: "subject",
        name: "subject",
        defaultValue: "hello",
      }),
    );
    assert.match(area, /<textarea[^>]*id="subject"/);
    assert.match(area, /hello/);
  });

  test("Select and Label compose for filter controls", () => {
    const html = renderToStaticMarkup(
      createElement(
        Label,
        { htmlFor: "passed" },
        createElement("span", null, "Pass/fail"),
        createElement(
          Select,
          { id: "passed", name: "passed", defaultValue: "true" },
          createElement("option", { value: "true" }, "Pass"),
          createElement("option", { value: "false" }, "Fail"),
        ),
      ),
    );
    assert.match(html, /Pass\/fail/);
    assert.match(html, /<select[^>]*id="passed"/);
    assert.match(html, /name="passed"/);
  });

  test("Badge and PassFailBadge expose status role and pass/fail labels", () => {
    const badge = renderToStaticMarkup(
      createElement(Badge, { tone: "pass" }, "ok"),
    );
    assert.match(badge, /role="status"/);

    const pass = renderToStaticMarkup(
      createElement(PassFailBadge, { passed: true }),
    );
    const fail = renderToStaticMarkup(
      createElement(PassFailBadge, { passed: false }),
    );
    assert.match(pass, /role="status"/);
    assert.match(pass, /Pass|pass/i);
    assert.match(fail, /Fail|fail/i);
  });

  test("Table wrappers render thead/tbody structure for history rows", () => {
    const html = renderToStaticMarkup(
      createElement(
        Table,
        null,
        createElement(
          TableHeader,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableHead, null, "When"),
            createElement(TableHead, null, "Pass/fail"),
          ),
        ),
        createElement(
          TableBody,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableCell, null, "now"),
            createElement(TableCell, null, "Pass"),
          ),
        ),
      ),
    );
    assert.match(html, /<table/);
    assert.match(html, /<thead/);
    assert.match(html, /When/);
    assert.match(html, /Pass\/fail/);
  });

  test("Tabs (Radix) render tablist, triggers, and panel ids used by the shell", () => {
    const html = renderToStaticMarkup(
      createElement(
        Tabs,
        { defaultValue: "a" },
        createElement(
          TabsList,
          { "aria-label": "Demo" },
          createElement(TabsTrigger, { value: "a", id: "tab-a" }, "A"),
          createElement(TabsTrigger, { value: "b", id: "tab-b" }, "B"),
        ),
        createElement(
          TabsContent,
          { value: "a", id: "panel-a" },
          "panel A",
        ),
        createElement(
          TabsContent,
          { value: "b", id: "panel-b" },
          "panel B",
        ),
      ),
    );
    assert.match(html, /role="tablist"/);
    assert.match(html, /role="tab"/);
    assert.match(html, /id="tab-a"/);
    assert.match(html, /id="panel-a"/);
  });

  test("DashboardShell uses library-backed tabs with stable tab and panel ids", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardShell, {
        panels: {
          fixtures: createElement("div", null, "fixtures"),
          playground: createElement("div", null, "playground"),
          history: createElement("div", null, "history"),
          batch: createElement("div", null, "batch"),
          rubrics: createElement("div", null, "rubrics"),
          agent: createElement("div", null, "agent"),
          synthesize: createElement("div", null, "synthesize-body"),
        },
      }),
    );
    assert.match(html, /role="tablist"/);
    assert.match(html, /id="tab-fixtures"/);
    assert.match(html, /id="tab-playground"/);
    assert.match(html, /id="tab-history"/);
    assert.match(html, /id="tab-batch"/);
    assert.match(html, /id="panel-history"/);
    assert.match(html, /id="tab-synthesize"/);
    assert.match(html, /id="panel-synthesize"/);
    // Source-level: shell imports Radix tabs wrappers
    assert.match(html, /data-state=/);
  });
});
