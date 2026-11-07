import { chromium } from 'playwright';
export async function launchBrowser() {
  const options = { headless:true };
  if (process.env.ROADMAP_BROWSER_PATH) return chromium.launch({ ...options, executablePath:process.env.ROADMAP_BROWSER_PATH });
  try { return await chromium.launch(options); }
  catch (original) {
    for (const channel of ['msedge','chrome']) {
      try { return await chromium.launch({ ...options,channel }); } catch { /* Try installed browser next. */ }
    }
    throw new Error(`Не найден Chromium. Выполните npx playwright install chromium или задайте ROADMAP_BROWSER_PATH. ${original.message}`);
  }
}
