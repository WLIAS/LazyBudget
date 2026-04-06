import pkg from '../package.json';

/** Short commit SHA baked in at build time by next.config.ts. */
const sha = process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'dev';

/** Full version string shown in the UI, e.g. "v0.3.7 · 9cde0d0" */
export const VERSION = `v${pkg.version} · ${sha}`;
