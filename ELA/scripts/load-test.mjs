/**
 * ELA — autocannon Load & Stress Test Script
 * Tests: Concurrent users, latency under load, endpoint resilience.
 * 
 * Run: node scripts/load-test.mjs
 * Dev server must be running on http://localhost:3000
 */

import autocannon from "autocannon";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";

const BASE_URL = "http://localhost:3000";

// ─── Colors ───────────────────────────────────────────────────────────────────
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

// ─── Run a single autocannon test ─────────────────────────────────────────────
function runTest(title, opts) {
  return new Promise((resolve) => {
    console.log(`\n${c.cyan(`▶ ${title}`)}`);
    console.log(c.dim(`  URL: ${opts.url}  |  Connections: ${opts.connections}  |  Duration: ${opts.duration}s`));

    const instance = autocannon({
      url: opts.url,
      connections: opts.connections,
      duration: opts.duration,
      method: opts.method || "GET",
      headers: opts.headers || {},
      body: opts.body || undefined,
      pipelining: 1,
      timeout: 10,
    });

    autocannon.track(instance, { renderProgressBar: true });

    instance.on("done", (result) => {
      resolve(result);
    });
  });
}

function printMetrics(result, warningThresholdMs = 3000) {
  const { latency, requests, errors, non2xx } = result;
  const p95 = latency.p97_5; // autocannon uses p97_5
  const p99 = latency.p99;
  const avgLatency = latency.mean;
  const rps = Math.round(requests.average);

  const latencyStatus = avgLatency < warningThresholdMs
    ? c.green(`${avgLatency.toFixed(1)}ms`)
    : c.red(`${avgLatency.toFixed(1)}ms ⚠️ EXCEEDS 3s THRESHOLD`);

  console.log(`\n  📊 Results:`);
  console.log(`  ├─ Avg Latency     : ${latencyStatus}`);
  console.log(`  ├─ p95 Latency     : ${p95 < 3000 ? c.green(`${p95}ms`) : c.red(`${p95}ms ⚠️`)}`);
  console.log(`  ├─ p99 Latency     : ${p99 < 5000 ? c.yellow(`${p99}ms`) : c.red(`${p99}ms ⚠️`)}`);
  console.log(`  ├─ Req/sec (avg)   : ${c.blue(`${rps} rps`)}`);
  console.log(`  ├─ Total Requests  : ${result.requests.total}`);
  console.log(`  ├─ Errors          : ${errors > 0 ? c.red(errors) : c.green(errors)}`);
  console.log(`  └─ Non-2xx Resp    : ${non2xx > 0 ? c.yellow(non2xx) : c.green(non2xx)}`);

  return {
    avgLatency,
    p95,
    p99,
    rps,
    errors,
    non2xx,
    pass: avgLatency < warningThresholdMs && errors < result.requests.total * 0.05,
  };
}

// ─── Mock Crop Doctor Endpoint Check ──────────────────────────────────────────
// NOTE: We test the endpoint for auth rejection (401) under load — 
// This simulates load WITHOUT hitting Gemini API (unauthenticated calls return 401 fast)
async function runLoadTests() {
  await mkdir("tests/results", { recursive: true });

  console.log("\n" + c.bold("═══════════════════════════════════════════════════════════════"));
  console.log(c.bold("   ⚡ ELA — LOAD & STRESS TEST SUITE (autocannon)"));
  console.log(c.bold("═══════════════════════════════════════════════════════════════") + "\n");
  console.log(c.dim("  ⚠️  Note: /api/crop-doctor calls are tested for auth-rejection speed"));
  console.log(c.dim("  ⚠️  (401 path). Real Gemini calls are intentionally NOT made.\n"));

  const summaryRows = [];

  // ── TEST 1: Login Page — Normal Load (20 VUs, 15s) ────────────────────────
  const loginResult = await runTest("Test 1: صفحة تسجيل الدخول (20 VUs / 15s)", {
    url: `${BASE_URL}/login`,
    connections: 20,
    duration: 15,
  });
  const loginMetrics = printMetrics(loginResult);
  summaryRows.push({
    name: "/login (20 VUs)",
    ...loginMetrics,
  });

  // ── TEST 2: Auth Redirect — Medium Load (50 VUs, 15s) ────────────────────
  const redirectResult = await runTest("Test 2: إعادة توجيه Middleware (50 VUs / 15s)", {
    url: `${BASE_URL}/farmer`,
    connections: 50,
    duration: 15,
  });
  const redirectMetrics = printMetrics(redirectResult);
  summaryRows.push({
    name: "/farmer redirect (50 VUs)",
    ...redirectMetrics,
  });

  // ── TEST 3: Crop Doctor API — Stress (100 VUs, 15s) ──────────────────────
  // Tests auth-rejection speed under 100 concurrent unauthenticated users
  const cropResult = await runTest(
    "Test 3: /api/crop-doctor — حماية 401 تحت الضغط (100 VUs / 15s)",
    {
      url: `${BASE_URL}/api/crop-doctor`,
      method: "POST",
      connections: 100,
      duration: 15,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: "data:image/jpeg;base64,/9j/fake" }),
    }
  );
  const cropMetrics = printMetrics(cropResult, 1500); // Stricter 1.5s for API endpoint
  summaryRows.push({
    name: "/api/crop-doctor auth rejection (100 VUs)",
    ...cropMetrics,
  });

  // ── TEST 4: Cron Reset Keys — Security Under Load (50 VUs, 10s) ──────────
  const cronResult = await runTest(
    "Test 4: /api/cron/reset-keys — فحص الأمان (50 VUs / 10s)",
    {
      url: `${BASE_URL}/api/cron/reset-keys`,
      connections: 50,
      duration: 10,
    }
  );
  const cronMetrics = printMetrics(cronResult);
  summaryRows.push({
    name: "/api/cron/reset-keys (50 VUs)",
    ...cronMetrics,
  });

  // ── SUMMARY TABLE ─────────────────────────────────────────────────────────
  console.log("\n" + c.bold("═══════════════════════════════════════════════════════════════"));
  console.log(c.bold("   📋 LOAD TEST SUMMARY TABLE"));
  console.log(c.bold("═══════════════════════════════════════════════════════════════"));
  console.log(
    `\n  ${"Endpoint".padEnd(40)} ${"Avg".padEnd(10)} ${"p95".padEnd(10)} ${"RPS".padEnd(8)} Status`
  );
  console.log("  " + "─".repeat(75));

  for (const row of summaryRows) {
    const status = row.pass ? c.green("✅ PASS") : c.red("❌ FAIL");
    const avgStr = `${row.avgLatency.toFixed(0)}ms`;
    const p95Str = `${row.p95}ms`;
    const rpsStr = `${row.rps}`;
    console.log(
      `  ${row.name.padEnd(40)} ${avgStr.padEnd(10)} ${p95Str.padEnd(10)} ${rpsStr.padEnd(8)} ${status}`
    );
  }

  const allPassed = summaryRows.every((r) => r.pass);
  console.log("\n  " + (allPassed ? c.green("🚀 All load tests PASSED.") : c.red("⚠️  Some tests exceeded thresholds!")));

  // Save JSON results
  const outputPath = "tests/results/load-test-results.json";
  const fs = await import("fs/promises");
  await fs.writeFile(outputPath, JSON.stringify({ timestamp: new Date().toISOString(), results: summaryRows }, null, 2));
  console.log(c.dim(`\n  Results saved to ${outputPath}\n`));

  return { passed: allPassed, rows: summaryRows };
}

runLoadTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
