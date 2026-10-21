import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://md-share-6y3.pages.dev",
  integrations: [react(), sitemap({ filter: (page) => !/\/(edit|404)\/?$/.test(page) })],
  build: { inlineStylesheets: "always" },
});
