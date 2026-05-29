import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { FieldParseResult } from "./fieldFormat";

type InlineEditableProps = {
  label: string;
  value: string;
  displayValue: string;
  parse: (value: string) => FieldParseResult;
  onCommit: (value: number) => void;
  inputMode?: "decimal" | "numeric" | "text";
};

export function InlineEditable({
  label,
  value,
  displayValue,
  parse,
  onCommit,
  inputMode = "text",
}: InlineEditableProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(value);
    }
  }, [isEditing, value]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commit = () => {
    const nextDraft = inputRef.current?.value ?? draft;
    const result = parse(nextDraft);
    if (!result.success) {
      setDraft(nextDraft);
      setError(result.message);
      return;
    }

    setError(null);
    skipBlurCommitRef.current = true;
    setIsEditing(false);
    onCommit(result.value);
  };

  const cancel = () => {
    skipBlurCommitRef.current = true;
    setDraft(value);
    setError(null);
    setIsEditing(false);
  };

  const handleBlur = () => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }

    commit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  if (isEditing) {
    return (
      <span className="inline-edit">
        <input
          ref={inputRef}
          aria-label={label}
          aria-invalid={error ? "true" : "false"}
          className={
            error ? "inline-edit-input inline-edit-input-error" : "inline-edit-input"
          }
          inputMode={inputMode}
          value={draft}
          onBlur={handleBlur}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
        />
        {error ? (
          <span className="inline-edit-error" role="alert">
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={
        error ? "inline-edit-value inline-edit-value-error" : "inline-edit-value"
      }
      aria-label={`Edit ${label}`}
      onClick={() => setIsEditing(true)}
    >
      {displayValue}
    </button>
  );
}
