/// <reference types="vite/client" />

/** Short commit hash + build time, injected by vite.config.ts `define`. On
 *  the title screen so "which build am I actually looking at?" is one glance
 *  — a stale browser-cached bundle once cost a whole debugging session. */
declare const __BUILD_TAG__: string;
