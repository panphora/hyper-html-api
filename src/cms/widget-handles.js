/**
 * Module-level WeakMap<HTMLElement, WidgetHandle> shared by form-builder
 * (writes), morphForm (reads on remove), and phase 5's shell-close logic
 * (reads on close).
 *
 * Internal-only — not re-exported from src/cms/index.js. We avoid stashing
 * handles as properties on the DOM element so author CSS/JS can't collide
 * with our internals, and entries clean up automatically when the row is
 * garbage-collected.
 *
 * A WidgetHandle is the normalized shape returned by every widget invocation:
 *   { el, destroy(), focus(), validate() }
 * Built-in widgets that don't need cleanup register a handle with a no-op
 * destroy so the morph hook can unconditionally call destroy?.() without
 * special-casing.
 */
export const widgetHandles = new WeakMap()
