import { expect, test, type Page } from "@playwright/test";
import { createShare, gotoApp, setEditorValue, type Created } from "./helpers";

type Viewport = { name: string; width: number; height: number; phone?: boolean };

// 16:9, 16:10 and iPhone (portrait + landscape) viewports, in CSS pixels.
const VIEWPORTS: Viewport[] = [
  { name: "16x9-1366x768", width: 1366, height: 768 },
  { name: "16x9-1536x864", width: 1536, height: 864 },
  { name: "16x9-1920x1080", width: 1920, height: 1080 },
  { name: "16x9-2560x1440", width: 2560, height: 1440 },
  { name: "16x10-1280x800", width: 1280, height: 800 },
  { name: "16x10-1440x900", width: 1440, height: 900 },
  { name: "16x10-1512x982", width: 1512, height: 982 },
  { name: "16x10-1680x1050", width: 1680, height: 1050 },
  { name: "16x10-1920x1200", width: 1920, height: 1200 },
  { name: "iphone-se", width: 375, height: 667, phone: true },
  { name: "iphone-13-mini", width: 375, height: 812, phone: true },
  { name: "iphone-14", width: 390, height: 844, phone: true },
  { name: "iphone-15", width: 393, height: 852, phone: true },
  { name: "iphone-16-pro", width: 402, height: 874, phone: true },
  { name: "iphone-pro-max", width: 430, height: 932, phone: true },
  { name: "iphone-se-landscape", width: 667, height: 375, phone: true },
  { name: "iphone-14-landscape", width: 844, height: 390, phone: true },
  { name: "iphone-pro-max-landscape", width: 932, height: 430, phone: true },
];

let shared: Created;
let locked: Created;

test.beforeAll(async ({ request }) => {
  shared = await createShare(request);
  locked = await createShare(request, { passwordProtected: true, password: "pw" });
});

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scrollWidth, "page must not scroll horizontally").toBeLessThanOrEqual(innerWidth);
}

async function expectInViewport(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, `${selector} rendered`).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 0.5);
}

async function expectTouchTargets(page: Page, selector: string) {
  const sizes = await page.locator(selector).evaluateAll((nodes) =>
    nodes.filter((node) => (node as HTMLElement).offsetParent).map((node) => node.getBoundingClientRect()).map((r) => Math.min(r.width, r.height))
  );
  for (const size of sizes) expect(size, `${selector} touch target`).toBeGreaterThanOrEqual(40);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: Boolean(vp.phone), hasTouch: Boolean(vp.phone) });
    const desktop = vp.width >= 901 && vp.height >= 560;

    test("editor", async ({ page }) => {
      await gotoApp(page, "/");
      await setEditorValue(page, "# Title\n\n| a | b | c | d | e | f | g | h | i | j |\n|---|---|---|---|---|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |\n\nSome text.");
      await expectNoHorizontalScroll(page);
      if (desktop) {
        await expectInViewport(page, "#create-share");
        await expectInViewport(page, "#markdown-input");
        await expectInViewport(page, "#markdown-preview");
        const height = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
        expect(height, "desktop editor fits one screen").toBeLessThanOrEqual(1);
      } else {
        await expectInViewport(page, "#create-share-mobile");
        await expectTouchTargets(page, ".icon-button, .button, [role=tab]");
        const fontSize = await page.locator("#markdown-input").evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
        expect(fontSize, "inputs >= 16px so iOS does not zoom").toBeGreaterThanOrEqual(16);
      }
      await shot(page, `${vp.name}-editor`);

      await page.locator(desktop ? "#create-share" : "#create-share-mobile").click();
      await expect(page.locator("#created-panel")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await shot(page, `${vp.name}-created`);
    });

    test("share page", async ({ page }) => {
      await page.goto(shared.url);
      await expectNoHorizontalScroll(page);
      await expect(page.locator(vp.width > 900 ? ".view-sidebar" : "#file-select")).toBeVisible();
      await expectInViewport(page, ".view-toolbar .actions");
      if (vp.phone) await expectTouchTargets(page, ".icon-button, .button, [role=tab]");
      await shot(page, `${vp.name}-share`);
    });

    test("gate and edit pages", async ({ page }) => {
      await page.goto(locked.url);
      await expectNoHorizontalScroll(page);
      await expectInViewport(page, "button[type=submit]");
      await shot(page, `${vp.name}-gate`);

      await gotoApp(page, shared.editUrl);
      await expect(page.locator("#markdown-input")).toHaveValue(/# Guide/);
      await expectNoHorizontalScroll(page);
      await shot(page, `${vp.name}-edit`);
    });
  });
}
