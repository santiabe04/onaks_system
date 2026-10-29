"use client";

import { useState } from "react";

/**
 * Valores de un form como estado: React resetea los campos no controlados
 * después de cada action, y con un error se perdería lo tipeado.
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
