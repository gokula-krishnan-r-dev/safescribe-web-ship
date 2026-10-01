/**
 * Playwright UI smoke: Super Admin Safety Engine + Clinical Repository + Pharmacist consultations.
 * Requires web on :3000 (use WEB_URL=http://localhost:3000 to match CORS) and API on :3001.
 *
 *   npx playwright install chromium
 *   WEB_URL=http://localhost:3000 npx tsx scripts/e2e-safety-ui.ts
 */
import { chromium, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';

async function login(page: Page, email: string, password: string) {
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
      { timeout: 20000 },
    ),
    page.locator('button:has-text("Sign In")').click(),
  ]);
  if (!resp.ok()) {
    throw new Error(`Login API failed: ${resp.status()} ${await resp.text()}`);
  }
  await page.waitForURL(/super-admin|pharmacist|admin/, { timeout: 20000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

  const check = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log('PASS', name);
    } catch (e) {
      results.push({ name, ok: false, detail: String(e) });
      console.log('FAIL', name, e);
    }
  };

  await check('login_page_loads', async () => {
    await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#email', { timeout: 15000 });
  });

  await check('super_admin_login_ui', async () => {
    await login(page, 'admin@safescript.com', 'SuperAdmin123!');
    if (!page.url().includes('super-admin')) {
      throw new Error(`Expected super-admin, got ${page.url()}`);
    }
  });

  await check('safety_engine_page', async () => {
    await page.goto(`${WEB}/super-admin/safety-engine`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const body = (await page.textContent('body')) ?? '';
    if (!/Safety|Rule|Clinical|Repository/i.test(body)) {
      throw new Error('Safety engine page missing expected labels');
    }
    const tab = page.getByText(/Clinical Repository/i).first();
    if ((await tab.count()) > 0) {
      await tab.click();
      await page.waitForTimeout(1000);
    }
    // Capture screenshot evidence
    const shotDir = path.resolve(__dirname, '../docs/e2e-screenshots');
    fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({
      path: path.join(shotDir, 'super-admin-safety-engine.png'),
      fullPage: true,
    });
  });

  await check('pharmacist_consultations_ui', async () => {
    await login(page, 'pharmacist@demo-pharmacy.com', 'Pharmacist123!');
    await page.goto(`${WEB}/pharmacist/consultations`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const body = ((await page.textContent('body')) ?? '').toLowerCase();
    if (!body.includes('consult')) {
      throw new Error('Consultations page did not render');
    }
    const shotDir = path.resolve(__dirname, '../docs/e2e-screenshots');
    fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({
      path: path.join(shotDir, 'pharmacist-consultations.png'),
      fullPage: true,
    });
  });

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\nUI ${failed.length ? 'FAIL' : 'PASS'} ${results.length - failed.length}/${results.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
