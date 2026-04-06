import pkg from '../package.json';

/** App version string, sourced from package.json at build time. */
export const VERSION = `v${pkg.version}`;
