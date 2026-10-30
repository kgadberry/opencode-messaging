/**
 * A minimal JSX factory for the TUI tests.
 *
 * A function component is called immediately, which is what lets a test reach
 * the registration side effects inside one; host elements collapse to a plain
 * record, since nothing here paints anything.
 */
// eslint-disable-next-line unicorn/require-module-specifiers -- Required for declare global.
export {}

declare global {
  // eslint-disable-next-line no-var
  var __jsx: (type: unknown, props?: Record<string, unknown>) => unknown
  // eslint-disable-next-line no-var
  var __fragment: string
}

globalThis.__jsx = (type, props) => (typeof type === "function" ? type(props ?? {}) : { type, props })
globalThis.__fragment = "fragment"
