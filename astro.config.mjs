import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { rehypeTodo } from './src/lib/rehype-todo.mjs';

// The public address of the site, used for share previews, the sitemap and robots.txt.
// On Vercel this is picked up automatically from the project's production domain.
// To force a custom domain, set SITE_URL (e.g. https://harshitha.dev) in Vercel → Settings → Environment Variables.
const site =
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  'http://localhost:4321';

export default defineConfig({
  site,
  integrations: [sitemap()],
  markdown: { rehypePlugins: [rehypeTodo] },
  build: { inlineStylesheets: 'auto' },
});
