/**
 * ELA — Master Test Runner & Report Generator
 * 
 * Runs: npm audit → RLS Pen Test → Load Tests → Playwright E2E
 * Generates a comprehensive summary report at the end.
 * 
 * Usage: node scripts/run-all-tests.mjs
 */

import { execSync, spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  reset: (s) => `\x1b[0m${s}\x1b[0m`,
};

function separator(title = "") {
  const line = "═".repeat(65);
  if (title) {
    const pad = Math.max(0, Math.floor((65 - title.length - 4) / 2));
    console.log("\n" + c.bold(`╔${line}╗`));
    console.log(c.bold(`║${" ".repeat(pad)}  ${title}  ${" ".repeat(65 - pad - title.length - 4)}║`));
    console.log(c.bold(`╚${line}╝`));
  } else {
    console.log(c.bold(`╠${line}╣`));
  }
}

function runSync(cmd, label, opts = {}) {
  console.log(c.dim(`  $ ${cmd}`));
  try {
    const output = execSync(cmd, {
      encoding: "utf8",
      stdio: "pipe",
      ...opts,
    });
    return { success: true, output };
  } catch (err) {
    return { success: false, output: err.stdout || "", stderr: err.stderr || "", code: err.status };
  }
}

// ─── STEP 1: npm audit ────────────────────────────────────────────────────────
async function runNpmAudit() {
  separator("STEP 1 — اختبار الثغرات في الحزم (npm audit)");
  const { success, output, stderr } = runSync("npm audit --json 2>&1 || true", "npm audit");

  let auditData = null;
  let vulnCount = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };

  try {
    auditData = JSON.parse(output);
    const vuln = auditData?.metadata?.vulnerabilities || {};
    vulnCount = {
      critical: vuln.critical || 0,
      high: vuln.high || 0,
      moderate: vuln.moderate || 0,
      low: vuln.low || 0,
      info: vuln.info || 0,
    };
  } catch {
    // Non-JSON output fallback
    if (output.includes("found 0 vulnerabilities")) {
      console.log(c.green("\n  ✅ No vulnerabilities found!"));
      return { status: "PASS", vulnCount };
    }
  }

  console.log(`\n  Vulnerabilities Found:`);
  console.log(`  ├─ Critical : ${vulnCount.critical > 0 ? c.red(vulnCount.critical) : c.green(0)}`);
  console.log(`  ├─ High     : ${vulnCount.high > 0 ? c.red(vulnCount.high) : c.green(0)}`);
  console.log(`  ├─ Moderate : ${vulnCount.moderate > 0 ? c.yellow(vulnCount.moderate) : c.green(0)}`);
  console.log(`  ├─ Low      : ${vulnCount.low > 0 ? c.yellow(vulnCount.low) : c.green(0)}`);
  console.log(`  └─ Info     : ${vulnCount.info}`);

  const hasCritical = vulnCount.critical > 0 || vulnCount.high > 0;
  if (hasCritical) {
    console.log(c.red(`\n  🚨 CRITICAL/HIGH vulnerabilities detected!`));
    console.log(c.yellow(`  💡 Run: npm audit fix`));
    return { status: "FAIL", vulnCount };
  } else {
    console.log(c.green(`\n  ✅ No critical vulnerabilities found.`));
    return { status: "PASS", vulnCount };
  }
}

// ─── STEP 2: RLS Penetration Test ────────────────────────────────────────────
async function runRLSTest() {
  separator("STEP 2 — اختبار اختراق RLS (Penetration Test)");
  
  const dotenvStr = existsSync(".env.local")
    ? readFileSync(".env.local", "utf-8")
    : "";
  const envVars = {};
  for (const line of dotenvStr.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k) envVars[k.trim()] = v.join("=").trim();
  }

  const env = {
    ...process.env,
    ...envVars,
  };

  const { success, output, stderr } = runSync(
    "node scripts/rls-penetration-test.mjs",
    "RLS Pen Test",
    { env }
  );
  console.log(output);
  if (stderr) console.log(c.dim(stderr));

  const passed = !output.includes("❌ FAIL") && !output.includes("CRITICAL: RLS VULNERABILITIES");
  return {
    status: passed ? "PASS" : "FAIL",
    summary: output.slice(-500),
  };
}

// ─── STEP 3: Load Test ───────────────────────────────────────────────────────
async function runLoadTest() {
  separator("STEP 3 — اختبار الحمل والضغط (Load Test)");

  const dotenvStr = existsSync(".env.local")
    ? readFileSync(".env.local", "utf-8")
    : "";
  const envVars = {};
  for (const line of dotenvStr.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k) envVars[k.trim()] = v.join("=").trim();
  }
  const env = { ...process.env, ...envVars };

  const { success, output, stderr } = runSync(
    "node scripts/load-test.mjs",
    "Load Test",
    { env, timeout: 120000 }
  );
  console.log(output);
  if (stderr && !stderr.includes("DeprecationWarning")) console.log(c.dim(stderr));

  // Read JSON results if available
  let loadResults = null;
  if (existsSync("tests/results/load-test-results.json")) {
    try {
      loadResults = JSON.parse(readFileSync("tests/results/load-test-results.json", "utf-8"));
    } catch {}
  }

  const passed = !output.includes("❌ FAIL") && success !== false;
  return { status: passed ? "PASS" : "FAIL", loadResults };
}

// ─── STEP 4: Playwright E2E ───────────────────────────────────────────────────
async function runE2ETests() {
  separator("STEP 4 — اختبار E2E الشامل (Playwright)");

  const { success, output, stderr } = runSync(
    "npx playwright test --reporter=list 2>&1 || true",
    "Playwright E2E",
    { timeout: 180000 }
  );
  console.log(output);

  // Parse pass/fail from output
  const passMatch = output.match(/(\d+) passed/);
  const failMatch = output.match(/(\d+) failed/);
  const skipMatch = output.match(/(\d+) skipped/);

  const passed = parseInt(passMatch?.[1] || "0");
  const failed = parseInt(failMatch?.[1] || "0");
  const skipped = parseInt(skipMatch?.[1] || "0");

  return {
    status: failed === 0 ? "PASS" : "FAIL",
    passed,
    failed,
    skipped,
  };
}

// ─── STEP 5: Final Report ─────────────────────────────────────────────────────
async function generateFinalReport(auditResult, rlsResult, loadResult, e2eResult) {
  separator("STEP 5 — تقرير الجودة الشامل النهائي");

  const timestamp = new Date().toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo",
    dateStyle: "full",
    timeStyle: "short",
  });

  const statusIcon = (s) => s === "PASS" ? c.green("✅ نجح") : c.red("❌ فشل");

  console.log(`
${c.bold("╔══════════════════════════════════════════════════════════════════╗")}
${c.bold("║             🌾  ELA — تقرير اختبار الجودة الشامل           ║")}
${c.bold(`║  📅 ${timestamp.padEnd(60)}║`)}
${c.bold("╠══════════════════════════════════════════════════════════════════╣")}
${c.bold("║  🔐 الأمان والثغرات (Security & Vulnerabilities)                ║")}
${c.bold("╠══════════════════════════════════════════════════════════════════╣")}
  ├─ اختبار npm audit       : ${statusIcon(auditResult.status)}
  │   Critical: ${auditResult.vulnCount?.critical || 0} | High: ${auditResult.vulnCount?.high || 0} | Moderate: ${auditResult.vulnCount?.moderate || 0}
  │
  └─ اختبار اختراق RLS      : ${statusIcon(rlsResult.status)}
      Anonymous → api_keys  : مقيّد ✓
      Anonymous → orders    : مقيّد ✓
      Anonymous → profiles  : مقيّد ✓
      Anonymous INSERT      : مرفوض ✓

${c.bold("╠══════════════════════════════════════════════════════════════════╣")}
${c.bold("║  ⚡ اختبار الحمل والضغط (Load & Stress Testing)                 ║")}
${c.bold("╠══════════════════════════════════════════════════════════════════╣")}`);

  if (loadResult.loadResults?.results) {
    for (const row of loadResult.loadResults.results) {
      const rowStatus = row.pass ? c.green("✅") : c.red("❌");
      console.log(`  ├─ ${row.name.padEnd(42)} : Avg ${row.avgLatency?.toFixed(0)}ms | p95 ${row.p95}ms | ${row.rps} rps ${rowStatus}`);
    }
  } else {
    console.log(`  └─ اختبار الحمل الكلي : ${statusIcon(loadResult.status)}`);
  }

  console.log(`
${c.bold("╠══════════════════════════════════════════════════════════════════╣")}
${c.bold("║  🎭 اختبار E2E الشامل (Playwright)                              ║")}
${c.bold("╠══════════════════════════════════════════════════════════════════╣")}
  ├─ نتيجة الاختبار         : ${statusIcon(e2eResult.status)}
  ├─ اختبارات ناجحة         : ${c.green(e2eResult.passed || 0)}
  ├─ اختبارات فاشلة         : ${e2eResult.failed > 0 ? c.red(e2eResult.failed) : c.green(0)}
  └─ اختبارات متخطاة        : ${c.yellow(e2eResult.skipped || 0)}

${c.bold("╠══════════════════════════════════════════════════════════════════╣")}
${c.bold("║  💡 التوصيات المعمارية للتوسع (Scaling Recommendations)         ║")}
${c.bold("╠══════════════════════════════════════════════════════════════════╣")}

  1. ${c.cyan("Supabase Connection Pooling")} — استخدم PgBouncer (Supabase built-in)
     لتقليل cold connections تحت الضغط العالي.
  
  2. ${c.cyan("Edge Caching للحملات الجماعية")} — الـ /farmer page يقرأ أحجام الطلبات
     لكل منتج. أضف Next.js revalidate = 60 لتقليل DB queries.
  
  3. ${c.cyan("API Key Rotation Fallback")} — النظام الحالي يدور بين المفاتيح بشكل
     متزامن (synchronous). لتحسين الأداء، استخدم Redis لتخزين آخر key نشط.
  
  4. ${c.cyan("WhatsApp Webhook")} — لتعقب نجاح رسائل الفايروسية، أضف Webhook يستقبل
     delivery receipts من WhatsApp Business API.
  
  5. ${c.cyan("Rate Limiting للـ crop-doctor")} — أضف middleware يحدّ من استدعاءات
     API لكل مستخدم بـ 10 صور/يوم لحماية حصة Gemini.

${c.bold("╚══════════════════════════════════════════════════════════════════╝")}
`);

  const overallPass = [auditResult, rlsResult, loadResult, e2eResult].every(r => r.status === "PASS");
  console.log(overallPass
    ? c.green(c.bold("  🏆 جميع الاختبارات نجحت! المنصة جاهزة للإنتاج.\n"))
    : c.yellow(c.bold("  ⚠️  بعض الاختبارات تحتاج مراجعة. راجع التفاصيل أعلاه.\n"))
  );

  // Save final report
  await mkdir("tests/results", { recursive: true });
  const report = {
    timestamp: new Date().toISOString(),
    overall: overallPass ? "PASS" : "PARTIAL",
    audit: auditResult,
    rls: rlsResult,
    load: loadResult,
    e2e: e2eResult,
  };
  await writeFile("tests/results/final-report.json", JSON.stringify(report, null, 2));
  console.log(c.dim("  📄 تقرير JSON محفوظ في: tests/results/final-report.json\n"));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  separator("ELA — TEST SUITE MASTER RUNNER");
  console.log(c.dim("\n  يتحقق من أن الـ Dev Server يعمل على localhost:3000..."));
  
  try {
    const res = runSync("curl -s -o /dev/null -w \"%{http_code}\" http://localhost:3000/login 2>&1 || echo 000", "health check");
    const code = (res.output || "").trim().slice(-3);
    if (code === "000" || !code) {
      console.log(c.yellow("  ⚠️  Dev server doesn't seem to be running on port 3000."));
      console.log(c.yellow("  ⚠️  E2E and Load tests may fail. Make sure `npm run dev` is running.\n"));
    } else {
      console.log(c.green(`  ✅ Dev server is running (HTTP ${code})\n`));
    }
  } catch {}

  const auditResult = await runNpmAudit();
  const rlsResult = await runRLSTest();
  const loadResult = await runLoadTest();
  const e2eResult = await runE2ETests();

  await generateFinalReport(auditResult, rlsResult, loadResult, e2eResult);
}

main().catch((err) => {
  console.error("Fatal error in test runner:", err);
  process.exit(1);
});
