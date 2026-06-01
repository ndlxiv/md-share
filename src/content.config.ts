import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro:schema";

const shares = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/shares" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    createdAt: z.coerce.date().optional(),
    public: z.boolean().default(true),
  }),
});

export const collections = { shares };
