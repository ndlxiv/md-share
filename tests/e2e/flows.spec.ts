import { expect, test } from "@playwright/test";
import { PICTOGRAPHIC, createShare, gotoApp, setEditorValue, visibleText } from "./helpers";

test("create a multi-file share from the editor and browse it", async ({ page, isMobile }) => {
  await gotoApp(page, "/");
  const create = page.locator(isMobile ? "#create-share-mobile" : "#create-share");
  await expect(create).toBeDisabled();

  await setEditorValue(page, "# Overview\n\nSee [the details](details.md).");
  await page.locator("#file-input").setInputFiles({ name: "details.md", mimeType: "text/markdown", buffer: Buffer.from("# Details\n\nDeep dive.") });
  await expect(page.locator(".file-name")).toHaveText(["Overview.md", "details.md"]);

  if (isMobile) await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.locator("#markdown-preview h1")).toHaveText("Details");

  await create.click();
  const panel = page.locator("#created-panel");
  await expect(panel.getByRole("heading", { name: "Share created" })).toBeVisible();
  const code = (await page.locator("#edit-code").textContent()) || "";
  expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}$/);
  const url = await page.locator("#share-url").inputValue();
  expect(await visibleText(page)).not.toMatch(PICTOGRAPHIC);

  await page.goto(url);
  await expect(page.locator(".view-file strong")).toHaveText("Overview.md");
  await page.locator("#preview a", { hasText: "the details" }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-z]+\/details$/);
  await expect(page.locator(".view-file strong")).toHaveText("details.md");

  await page.getByRole("tab", { name: "Raw" }).click();
  await expect(page.locator("#raw")).toContainText("# Details");
  await expect(page.locator("#preview")).toBeHidden();
  expect(await visibleText(page)).not.toMatch(PICTOGRAPHIC);
});

test("Create another resets the editor", async ({ page, isMobile }) => {
  await gotoApp(page, "/");
  await setEditorValue(page, "# One");
  await page.locator(isMobile ? "#create-share-mobile" : "#create-share").click();
  await page.locator("#create-another").click();
  await expect(page.locator("#markdown-input")).toHaveValue("");
  await expect(page.locator(".file-name")).toHaveCount(1);
});

test("edit a share with its edit link, then delete it", async ({ page, request, isMobile }) => {
  const created = await createShare(request);
  await gotoApp(page, created.editUrl);
  await expect(page.locator("#markdown-input")).toHaveValue(/# Guide/);
  expect(page.url()).not.toContain("#");

  await setEditorValue(page, "# Guide v2\n\nUpdated body.");
  await page.locator(isMobile ? "#create-share-mobile" : "#create-share").click();
  await expect(page.getByRole("status")).toContainText("Changes saved");

  const view = await page.context().newPage();
  await view.goto(created.url);
  await expect(view.locator("#preview h1")).toHaveText("Guide v2");
  await view.close();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete share" }).click();
  await expect(page.getByRole("heading", { name: "Share deleted" })).toBeVisible();
  expect((await request.get(created.url)).status()).toBe(404);
});

test("a wrong edit code is rejected inline", async ({ page, request }) => {
  const created = await createShare(request);
  await gotoApp(page, `/e/${created.share.id}`);
  await page.locator("#edit-code-input").fill("AAAA-BBBB-CCCC-DDDD-EEEE-FFFF");
  await page.getByRole("button", { name: "Edit share" }).click();
  await expect(page.getByRole("alert")).toContainText("doesn't match");
  await page.locator("#edit-code-input").fill(created.editCode.toLowerCase().replace(/-/g, ""));
  await page.getByRole("button", { name: "Edit share" }).click();
  await expect(page.locator("#markdown-input")).toHaveValue(/# Guide/);
});

test("password-protected shares unlock once for every file", async ({ page, request }) => {
  const created = await createShare(request, { passwordProtected: true, password: "open sesame" });
  await page.goto(created.url);
  await expect(page.getByRole("heading", { name: "Protected share" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Read the");

  await page.locator('input[name="password"]').fill("wrong");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect password");

  await page.locator('input[name="password"]').fill("open sesame");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator("#preview h1")).toHaveText("Guide");

  await page.goto(created.share.files[2].url);
  await expect(page.locator("#preview h1")).toHaveText("FAQ");
});

test("Download all returns a zip of every file", async ({ request }) => {
  const created = await createShare(request);
  const response = await request.get(`${created.url}?download=zip`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/zip");
  const body = await response.body();
  expect(body.subarray(0, 4).toString("hex")).toBe("504b0304");
  for (const name of ["guide.md", "setup.md", "faq.md"]) expect(body.includes(Buffer.from(name))).toBe(true);
});

test("unknown pages render the 404 page", async ({ page }) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
