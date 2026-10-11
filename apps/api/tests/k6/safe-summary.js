// Export numerical metrics only. setup_data contains live authentication tokens.
export function summaryOutputs(data, summaryPath) {
  const metrics = {};
  for (const [name, metric] of Object.entries(data.metrics || {})) {
    const values = {};
    for (const [key, value] of Object.entries(metric.values || {})) {
      if (typeof value === "number") values[key] = value;
    }
    const thresholds = {};
    for (const [expression, result] of Object.entries(metric.thresholds || {})) {
      // Preserve the legacy export convention: true means threshold FAILED.
      thresholds[expression] = result.ok !== true;
    }
    metrics[name] = {
      ...values,
      ...(Object.keys(thresholds).length ? { thresholds } : {}),
    };
  }
  const lines = [
    "\nk6 metrics (durations: ms; rate metrics: fractions; counter rates: /s)",
  ];
  for (const name of Object.keys(metrics).sort()) {
    const metric = metrics[name];
    const values = Object.entries(metric)
      .filter(([, value]) => typeof value === "number")
      .map(([key, value]) => `${key}=${value.toFixed(3)}`);
    lines.push(`${name}: ${values.join(" ")}`);
    for (const [expression, failed] of Object.entries(metric.thresholds || {})) {
      lines.push(`  ${failed ? "FAIL" : "PASS"}: ${expression}`);
    }
  }
  const outputs = { stdout: lines.join("\n") + "\n" };
  if (summaryPath) {
    outputs[summaryPath] = JSON.stringify({ metrics }, null, 2) + "\n";
  }
  return outputs;
}
