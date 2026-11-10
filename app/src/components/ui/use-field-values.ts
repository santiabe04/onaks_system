"use client";

import { type FormEvent, startTransition, useState } from "react";

/**
 * A form's values as state: with an error, what was typed is not lost.
 * Used with `submitWithoutReset`, because React resets the form after each
 * action and a controlled select would go back to its first option.
 */
export function useFieldValues(initial: Record<string, string>) {
  const [values, setValues] = useState(initial);
  const value = (name: string) => values[name] ?? "";
  const bind = (name: string) => ({
    name,
    value: value(name),
    onChange: (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [name]: event.target.value })),
  });
  /** Changes several fields at once (e.g. an automatic allocation). */
  const setMany = (changes: Record<string, string>) =>
    setValues((current) => ({ ...current, ...changes }));
  return { value, bind, setMany };
}

/**
 * `onSubmit` that sends the form to the `useActionState` action without the
 * automatic reset of `<form action>` (which desynchronizes the controlled fields).
 */
export function submitWithoutReset(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(
      event.currentTarget,
      (event.nativeEvent as SubmitEvent).submitter,
    );
    startTransition(() => dispatch(formData));
  };
}
