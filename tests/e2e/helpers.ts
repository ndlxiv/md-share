import type { APIRequestContext, Page } from "@playwright/test";

export type Created = { url: string; editCode: string; editUrl: string; share: { id: string; files: { slug: string; url: string }[] } };

const WIDE_TABLE = `| ${Array.from({ length: 12 }, (_, i) => `Column ${i + 1}`).join(" | ")} |\n|${" --- |".repeat(12)}\n| ${Array.from({ length: 12 }, (_, i) => `value-${i + 1}-with-long-text`).join(" | ")} |`;

export const SAMPLE_FILES = [
  {
    filename: "guide.md",
    content: `# Guide\n\nRead the [setup notes](./setup.md#install) first.\n\n${WIDE_TABLE}\n\n\`\`\`bash\nnpx wrangler pages deploy dist --project-name md-share --branch main --commit-dirty=true\n\`\`\`\n\n> A quote that should wrap nicely on small screens.\n\n- [x] done\n- [ ] todo`,
  },
  { filename: "setup.md", content: "# Setup\n\n## Install\n\nRun `npm install`." },
  { filename: "faq.md", content: "# FAQ\n\nNothing yet." },
];

export async function createShare(request: APIRequestContext, body: Record<string, unknown> = {}): Promise<Created> {
  const response = await request.post("/api/shares", { data: { files: SAMPLE_FILES, expiration: "1d", ...body } });
  if (response.status() !== 201) throw new Error(`create failed: ${response.status()} ${await response.text()}`);
  return response.json();
}

export const PICTOGRAPHIC = /[\p{Extended_Pictographic}\u{FF0B}\u{2713}]/u;

export async function visibleText(page: Page) {
  return page.evaluate(() => document.body.innerText);
}

export async function setEditorValue(page: Page, value: string) {
  await page.locator("#markdown-input").fill(value);
}

// Wait until the React island has hydrated before interacting with it.
export async function gotoApp(page: Page, url: string) {
  const response = await page.goto(url);
  await page.locator(".composer[data-ready]").waitFor();
  return response;
}
