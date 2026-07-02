import { test, expect, type Page } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function waitForArabicText(page: Page, text: string, timeout = 8000) {
  await expect(page.getByText(text)).toBeVisible({ timeout });
}

// ─── Test Suite 1: Unauthenticated Access & Redirects ─────────────────────────
test.describe("الحماية والتوجيه (Auth Guards & Redirects)", () => {
  test("يجب أن يُحوِّل الجذر / إلى /login للزوار", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/login", { timeout: 8000 });
    await waitForArabicText(page, "تسجيل الدخول");
  });

  test("يجب أن يُحوِّل /distributor إلى /login للزوار", async ({ page }) => {
    await page.goto("/distributor");
    await page.waitForURL("**/login", { timeout: 8000 });
    await waitForArabicText(page, "تسجيل الدخول");
  });

  test("يجب أن يُحوِّل /farmer إلى /login للزوار", async ({ page }) => {
    await page.goto("/farmer");
    await page.waitForURL("**/login", { timeout: 8000 });
    await waitForArabicText(page, "تسجيل الدخول");
  });

  test("يجب أن يُحوِّل /admin إلى /login للزوار", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL("**/login", { timeout: 8000 });
    await waitForArabicText(page, "تسجيل الدخول");
  });

  test("صفحة تسجيل الدخول تظهر باللغة العربية", async ({ page }) => {
    await page.goto("/login");
    await waitForArabicText(page, "تسجيل الدخول");
    // The page must have an email/phone input
    const input = page.locator("input").first();
    await expect(input).toBeVisible();
  });
});

// ─── Test Suite 2: Login Page UI Integrity ────────────────────────────────────
test.describe("واجهة صفحة الدخول (Login UI)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("يجب أن تحتوي الصفحة على حقل الإيميل والكلمة السرية", async ({ page }) => {
    const inputs = page.locator("input");
    await expect(inputs).toHaveCount(2);
  });

  test("يجب أن يظهر زر تسجيل الدخول", async ({ page }) => {
    const btn = page.locator("button[type='submit'], button").filter({ hasText: "تسجيل" }).first();
    await expect(btn).toBeVisible();
  });

  test("لا يجب أن تنتهي الصفحة بـ 5xx أو 4xx", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBeLessThan(400);
  });
});

// ─── Test Suite 3: API Endpoint Health ───────────────────────────────────────
test.describe("صحة نقاط API (API Health)", () => {
  test("POST /api/crop-doctor يُرجع 401 بدون مصادقة", async ({ request }) => {
    const res = await request.post("/api/crop-doctor", {
      data: { imageBase64: "data:image/jpeg;base64,/9j/4AAQ" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("غير مصرح");
  });

  test("GET /api/cron/reset-keys يُرجع 401 بدون Bearer token", async ({ request }) => {
    const res = await request.get("/api/cron/reset-keys");
    expect(res.status()).toBe(401);
  });

  test("GET /api/cron/reset-keys يُرجع 401 بـ token خاطئ", async ({ request }) => {
    const res = await request.get("/api/cron/reset-keys", {
      headers: { Authorization: "Bearer wrong-token-123" },
    });
    expect(res.status()).toBe(401);
  });
});

// ─── Test Suite 4: Performance Baseline ──────────────────────────────────────
test.describe("قياس الأداء (Performance Baseline)", () => {
  test("صفحة تسجيل الدخول تستجيب في أقل من 3 ثوانٍ", async ({ page }) => {
    const start = Date.now();
    await page.goto("/login");
    await waitForArabicText(page, "تسجيل الدخول");
    const duration = Date.now() - start;
    console.log(`  → Login page load: ${duration}ms`);
    expect(duration).toBeLessThan(3000);
  });

  test("توجيه /farmer يستجيب في أقل من 3 ثوانٍ", async ({ page }) => {
    const start = Date.now();
    await page.goto("/farmer");
    await page.waitForURL("**/login", { timeout: 5000 });
    const duration = Date.now() - start;
    console.log(`  → /farmer redirect: ${duration}ms`);
    expect(duration).toBeLessThan(3000);
  });
});
