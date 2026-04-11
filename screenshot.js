import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

try {
  await page.goto('http://localhost:1420/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: '/Users/mugbya/git-files/genealogy-tree/genealogy/screenshot.png', fullPage: true });
  console.log('Screenshot saved to screenshot.png');
} catch (e) {
  console.error('Error:', e.message);
}

await browser.close();
