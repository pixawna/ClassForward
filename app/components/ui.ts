/** Shared class strings so every page uses the same buttons and fields. */

export const redButton =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-ink bg-redpen px-5 py-2.5 font-semibold whitespace-nowrap text-white shadow-[0_4px_0_var(--color-ink)] transition-[translate,box-shadow,background-color] hover:bg-redpen-deep active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-ink)] disabled:cursor-wait disabled:opacity-70";

export const quietButton =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-ink/15 bg-white px-4 py-2 font-medium whitespace-nowrap text-ink transition-colors hover:border-ink/40 disabled:cursor-wait disabled:opacity-60";

export const paperCard =
  "rounded-2xl border-2 border-ink bg-[#FFFDF8] shadow-[0_5px_0_var(--color-ink)]";

export const fieldLabel = "block text-lg font-semibold text-ink";
export const fieldHint = "mt-1 text-ink-soft";
export const fieldInput =
  "w-full rounded-xl border-2 border-ink/20 bg-white px-4 py-3 text-lg text-ink placeholder:text-ink-soft/55 focus:border-ink";
export const fieldError = "mt-2 font-hand text-xl text-redpen";
