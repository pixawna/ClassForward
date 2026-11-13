"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { DURATION_DEFAULT, DURATION_MAX, DURATION_MIN, DURATION_STEPS, formatDuration } from "@/lib/lesson-limits";
import { createLessonAction, type LessonFormState } from "../actions";
import { fieldError, fieldHint, fieldInput, fieldLabel, paperCard, quietButton, redButton } from "../../../components/ui";

/** Quick picks, in seconds. */
const DURATIONS = [10, 60, 5 * 60, 10 * 60, 15 * 60, 30 * 60];

/** The big readout above the slider: "10" seconds, "1½" minutes, "15" minutes. */
function readout(seconds: number) {
  if (seconds < 60) return { amount: String(seconds), unit: "seconds" };
  const m = Math.floor(seconds / 60);
  const amount = seconds % 60 === 30 ? `${m}½` : String(m);
  return { amount, unit: seconds === 60 ? "minute" : "minutes" };
}
const LEVELS = [
  { value: "high_school", label: "High school", hint: "Grades 9 to 12" },
  { value: "college", label: "College", hint: "Undergraduate and up" },
];
const MAX_OBJECTIVES = 8;

/** A saved lesson's details, to start the form from when editing. */
export type LessonFormValues = {
  topic: string;
  level: string;
  durationSeconds: number;
  priorKnowledge: string;
  objectives: string[];
};

type Props = {
  /** Defaults to creating a new lesson. */
  action?: (state: LessonFormState, data: FormData) => Promise<LessonFormState>;
  initial?: LessonFormValues;
  submitLabel?: string;
  cancelHref?: string;
};

export function LessonForm({
  action = createLessonAction,
  initial,
  submitLabel = "Save and find sources",
  cancelHref = "/classroom",
}: Props) {
  const [state, formAction, pending] = useActionState<LessonFormState, FormData>(action, { errors: {} });
  const [duration, setDuration] = useState(initial?.durationSeconds ?? DURATION_DEFAULT); // seconds
  const shown = readout(duration);
  const [objectives, setObjectives] = useState<string[]>(initial?.objectives.length ? initial.objectives : [""]);
  // Hide a field's error as soon as the teacher edits that field.
  const [edited, setEdited] = useState<{ after: LessonFormState; fields: string[] }>({ after: state, fields: [] });
  const editedFields = edited.after === state ? edited.fields : [];
  const errors = Object.fromEntries(
    Object.entries(state.errors).filter(([field]) => !editedFields.includes(field)),
  ) as LessonFormState["errors"];
  const markEdited = (field: string) =>
    setEdited((e) => ({ after: state, fields: e.after === state ? [...e.fields, field] : [field] }));

  // Submit without React's automatic form reset, so nothing typed is lost on a validation error.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  }

  const setObjective = (i: number, value: string) =>
    setObjectives((list) => list.map((o, j) => (j === i ? value : o)));

  return (
    <form onSubmit={onSubmit} noValidate className={`${paperCard} mt-10 space-y-10 p-6 sm:p-10`}>
      {/* Topic */}
      <div>
        <label htmlFor="topic" className={fieldLabel}>
          Topic
        </label>
        <p id="topic-hint" className={fieldHint}>
          What is this lesson about?
        </p>
        <input
          id="topic"
          name="topic"
          required
          maxLength={160}
          placeholder="The water cycle"
          defaultValue={initial?.topic}
          onChange={() => markEdited("topic")}
          aria-describedby={errors.topic ? "topic-hint topic-error" : "topic-hint"}
          aria-invalid={!!errors.topic}
          className={`${fieldInput} mt-3`}
        />
        {errors.topic && (
          <p id="topic-error" className={fieldError}>
            {errors.topic}
          </p>
        )}
      </div>

      {/* Level */}
      <fieldset aria-describedby={errors.level ? "level-error" : undefined}>
        <legend className={fieldLabel}>Level</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {LEVELS.map((l) => (
            <label
              key={l.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-ink/20 bg-white p-4 transition-colors hover:border-ink/45 has-checked:border-ink has-checked:bg-[#FFF4D6] has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-redpen"
            >
              <input
                type="radio"
                name="level"
                value={l.value}
                defaultChecked={l.value === (initial?.level ?? "high_school")}
                onChange={() => markEdited("level")}
                className="mt-1 size-5 accent-redpen focus-visible:outline-none"
              />
              <span>
                <span className="block text-lg font-semibold text-ink">{l.label}</span>
                <span className="block text-ink-soft">{l.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.level && (
          <p id="level-error" className={fieldError}>
            {errors.level}
          </p>
        )}
      </fieldset>

      {/* Duration */}
      <div>
        <label htmlFor="duration" className={fieldLabel}>
          Lesson length
        </label>
        <p id="duration-hint" className={fieldHint}>
          From {formatDuration(DURATION_MIN)} to {formatDuration(DURATION_MAX)}.
        </p>
        <p className="mt-4 flex items-baseline gap-2" aria-hidden="true">
          <span className="font-serif text-5xl font-medium text-ink tabular-nums">{shown.amount}</span>
          <span className="text-lg text-ink-soft">{shown.unit}</span>
        </p>
        <input type="hidden" name="duration" value={duration} />
        {/* The slider moves through DURATION_STEPS: 10-second steps under a minute, whole minutes above two. */}
        <input
          id="duration"
          type="range"
          min={0}
          max={DURATION_STEPS.length - 1}
          step={1}
          value={Math.max(0, DURATION_STEPS.indexOf(duration))}
          onChange={(e) => {
            setDuration(DURATION_STEPS[Number(e.target.value)]);
            markEdited("duration");
          }}
          aria-valuetext={formatDuration(duration)}
          aria-invalid={!!errors.duration}
          aria-describedby={errors.duration ? "duration-hint duration-error" : "duration-hint"}
          className="mt-2 h-7 w-full cursor-pointer accent-redpen"
        />
        <div className="flex justify-between text-sm text-ink-soft" aria-hidden="true">
          <span>{formatDuration(DURATION_MIN, "short")}</span>
          <span>{formatDuration(DURATION_MAX, "short")}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Common lengths">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDuration(d);
                markEdited("duration");
              }}
              aria-pressed={duration === d}
              className="cursor-pointer rounded-full border-2 border-ink/15 bg-white px-4 py-2 font-medium text-ink transition-colors hover:border-ink/40 aria-pressed:border-ink aria-pressed:bg-[#9CCDEB]/40"
            >
              {formatDuration(d, "short")}
            </button>
          ))}
        </div>
        {errors.duration && (
          <p id="duration-error" className={fieldError}>
            {errors.duration}
          </p>
        )}
      </div>

      {/* Prior knowledge */}
      <div>
        <label htmlFor="priorKnowledge" className={fieldLabel}>
          What students already know
        </label>
        <p id="prior-hint" className={fieldHint}>
          Earlier lessons, vocabulary, skills, common misconceptions.
        </p>
        <textarea
          id="priorKnowledge"
          name="priorKnowledge"
          rows={4}
          maxLength={2000}
          defaultValue={initial?.priorKnowledge}
          onChange={() => markEdited("priorKnowledge")}
          placeholder="They know the three states of matter and that heating water makes it evaporate. Most think clouds are made of steam."
          aria-describedby={errors.priorKnowledge ? "prior-hint prior-error" : "prior-hint"}
          aria-invalid={!!errors.priorKnowledge}
          className={`${fieldInput} mt-3 resize-y leading-relaxed`}
        />
        {errors.priorKnowledge && (
          <p id="prior-error" className={fieldError}>
            {errors.priorKnowledge}
          </p>
        )}
      </div>

      {/* Objectives */}
      <fieldset aria-describedby={errors.objectives ? "objectives-hint objectives-error" : "objectives-hint"}>
        <legend className={fieldLabel}>Learning objectives</legend>
        <p id="objectives-hint" className={fieldHint}>
          By the end of the lesson, students can...
        </p>
        <ol className="mt-3 space-y-3">
          {objectives.map((objective, i) => (
            <li key={i} className="flex items-center gap-3">
              <span aria-hidden="true" className="w-6 shrink-0 text-right font-hand text-2xl text-redpen">
                {i + 1}.
              </span>
              <input
                name="objective"
                value={objective}
                onChange={(e) => {
                  setObjective(i, e.target.value);
                  markEdited("objectives");
                }}
                maxLength={300}
                aria-label={`Objective ${i + 1}`}
                placeholder={
                  i === 0 ? "Describe the four stages of the water cycle" : "Explain why clouds form when air cools"
                }
                className={fieldInput}
              />
              {objectives.length > 1 && (
                <button
                  type="button"
                  onClick={() => setObjectives((list) => list.filter((_, j) => j !== i))}
                  aria-label={`Remove objective ${i + 1}`}
                  className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-2xl text-ink-soft transition-colors hover:bg-ink/5 hover:text-redpen"
                >
                  &times;
                </button>
              )}
            </li>
          ))}
        </ol>
        {objectives.length < MAX_OBJECTIVES && (
          <button
            type="button"
            onClick={() => setObjectives((list) => [...list, ""])}
            className={`${quietButton} mt-4 ml-9`}
          >
            + Add an objective
          </button>
        )}
        {errors.objectives && (
          <p id="objectives-error" className={fieldError}>
            {errors.objectives}
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-4 border-t-2 border-dashed border-ink/15 pt-8">
        <button type="submit" disabled={pending} className={redButton}>
          {pending ? "Saving..." : submitLabel}
        </button>
        <Link href={cancelHref} className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">
          Cancel
        </Link>
        {Object.keys(errors).length > 0 && (
          <p role="alert" className="w-full font-hand text-xl text-redpen">
            A few things need fixing before this lesson can be saved.
          </p>
        )}
        {state.notice && (
          <p role="alert" className="w-full font-hand text-xl text-redpen">
            {state.notice}
          </p>
        )}
      </div>
    </form>
  );
}
