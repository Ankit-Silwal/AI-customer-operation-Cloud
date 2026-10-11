import assert from "node:assert/strict";
import test from "node:test";
import { summaryOutputs } from "./k6/safe-summary.js";

test("load reports exclude setup credentials and unapproved metadata", () => {
  const privateValue = "PRIVATE_CREDENTIAL_SENTINEL";
  const data = {
    setup_data: { token: privateValue, organizationId: "private-id" },
    future_private_field: privateValue,
    metrics: {
      http_reqs: {
        values: { count: 4, rate: 2, token: privateValue },
        private_metadata: privateValue,
      },
    },
  };
  const before = JSON.stringify(data);
  const outputs = summaryOutputs(data, "report.json");
  assert.deepEqual(JSON.parse(outputs["report.json"]), {
    metrics: { http_reqs: { count: 4, rate: 2 } },
  });
  assert.equal(JSON.stringify(outputs).includes(privateValue), false);
  assert.equal(JSON.stringify(data), before);
  assert.match(outputs.stdout, /http_reqs: count=4\.000 rate=2\.000/);
});

test("load reports preserve both passing and failing threshold flags", () => {
  const outputs = summaryOutputs({
    metrics: {
      http_req_duration: {
        values: { "p(95)": 700 },
        thresholds: { "p(95)<500": { ok: false }, "p(95)<1000": { ok: true } },
      },
    },
  }, "report.json");
  assert.deepEqual(JSON.parse(outputs["report.json"]).metrics.http_req_duration.thresholds, {
    "p(95)<500": true,
    "p(95)<1000": false,
  });
  assert.match(outputs.stdout, /FAIL: p\(95\)<500/);
  assert.match(outputs.stdout, /PASS: p\(95\)<1000/);
});

test("a normal CLI run prints metrics without creating an export file", () => {
  assert.deepEqual(Object.keys(summaryOutputs({ metrics: {} }, undefined)), ["stdout"]);
});
