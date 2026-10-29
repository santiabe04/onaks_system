"use client";

import { type FormEvent, startTransition, useState } from "react";

/**
 * Valores de un form como estado: con un error no se pierde lo tipeado.
 * Va con `submitWithoutReset`, porque React resetea el form después de cada
 * action y un select controlado volvería a su primera opción.
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
  /** Cambia varios campos a la vez (p. ej. una imputación automática). */
  const setMany = (changes: Record<string, string>) =>
    setValues((current) => ({ ...current, ...changes }));
  return { value, bind, setMany };
}

/**
 * `onSubmit` que manda el form a la action de `useActionState` sin el reset
 * automático de `<form action>` (que desincroniza los campos controlados).
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
