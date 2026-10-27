import { z } from "zod";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";

// Puro: validación y reglas del árbol de categorías (las usan las actions, las
// páginas y los tests).

/** La raíz es el nivel 1. */
export const MAX_CATEGORY_DEPTH = 3;
export const CATEGORY_NAME_MAX_LENGTH = 50;

export type CategoryRow = { id: number; name: string; parentId: number | null };

export type CategoryNode = CategoryRow & {
  depth: number;
  /** Nombres desde la raíz: ["Limpieza", "Pisos"]. */
  path: string[];
  childCount: number;
};

function childrenByParent(rows: CategoryRow[]) {
  const map = new Map<number | null, CategoryRow[]>();
  for (const row of rows) {
    const list = map.get(row.parentId) ?? [];
    list.push(row);
    map.set(row.parentId, list);
  }
  return map;
}

/** El árbol aplanado en orden de lectura: cada categoría seguida de sus hijas, por nombre. */
export function flattenCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const byParent = childrenByParent(rows);
  const result: CategoryNode[] = [];

  const visit = (parentId: number | null, depth: number, path: string[]) => {
    const children = [...(byParent.get(parentId) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const child of children) {
      const childPath = [...path, child.name];
      result.push({
        ...child,
        depth,
        path: childPath,
        childCount: byParent.get(child.id)?.length ?? 0,
      });
      visit(child.id, depth + 1, childPath);
    }
  };

  visit(null, 1, []);
  return result;
}

/** Ids de todas las descendientes (sin incluir a la categoría). */
export function descendantIds(rows: CategoryRow[], id: number): Set<number> {
  const byParent = childrenByParent(rows);
  const result = new Set<number>();
  const stack = [id];
  while (stack.length > 0) {
    for (const child of byParent.get(stack.pop()!) ?? []) {
      if (!result.has(child.id)) {
        result.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return result;
}

function depthOf(rows: CategoryRow[], id: number): number {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let depth = 0;
  let current = byId.get(id);
  // El tope evita un loop infinito si la DB tuviera un ciclo.
  while (current && depth <= rows.length) {
    depth++;
    current =
      current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return depth;
}

/** Niveles que ocupa la categoría con sus descendientes (1 si no tiene hijas). */
function subtreeHeight(rows: CategoryRow[], id: number): number {
  const byParent = childrenByParent(rows);
  const height = (nodeId: number, guard: number): number =>
    guard > rows.length
      ? 0
      : 1 +
        Math.max(
          0,
          ...(byParent.get(nodeId) ?? []).map((c) => height(c.id, guard + 1)),
        );
  return height(id, 0);
}

export type ParentError = "parentNotFound" | "cycle" | "tooDeep";

/**
 * Si `parentId` sirve como padre de la categoría `id` (null si es nueva):
 * que exista, que no sea ella misma ni una descendiente, y que el subárbol
 * entero siga dentro de los 3 niveles.
 */
export function checkParent(
  rows: CategoryRow[],
  id: number | null,
  parentId: number | null,
): ParentError | null {
  if (parentId === null) {
    return id !== null && subtreeHeight(rows, id) > MAX_CATEGORY_DEPTH
      ? "tooDeep"
      : null;
  }
  if (!rows.some((row) => row.id === parentId)) return "parentNotFound";
  if (id !== null && (parentId === id || descendantIds(rows, id).has(parentId)))
    return "cycle";
  const height = id === null ? 1 : subtreeHeight(rows, id);
  return depthOf(rows, parentId) + height > MAX_CATEGORY_DEPTH
    ? "tooDeep"
    : null;
}

/**
 * Categorías que se pueden elegir como padre de `id` (null si es nueva). Las
 * que tienen productos quedan afuera: solo las finales pueden tenerlos.
 */
export function parentOptions(
  rows: CategoryRow[],
  id: number | null,
  withProducts: ReadonlySet<number> = new Set(),
): CategoryNode[] {
  return flattenCategoryTree(rows).filter(
    (node) =>
      !withProducts.has(node.id) && checkParent(rows, id, node.id) === null,
  );
}

// --- Formulario ---

type Messages = Dictionary["categories"]["errors"];

export type CategoryValues = { name: string; parentId: string };

export type CategoryFormState = {
  errors?: Partial<Record<keyof CategoryValues | "form", string[]>>;
  values?: CategoryValues;
};

export type CategoryInput = { name: string; parentId: number | null };

// La columna es INTEGER (int4): cualquier cosa fuera de rango no puede existir.
const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** Convierte un id de la URL o de un form en número; null si no es válido. */
export function parseCategoryId(raw: unknown): number | null {
  const parsed = idSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function categorySchema(t: Messages) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t.nameRequired)
      .max(
        CATEGORY_NAME_MAX_LENGTH,
        interpolate(t.nameTooLong, { max: CATEGORY_NAME_MAX_LENGTH }),
      ),
    // Vacío = categoría raíz.
    parentId: z.string().transform((value, ctx) => {
      if (value === "") return null;
      const id = parseCategoryId(value);
      if (id === null) {
        ctx.addIssue({ code: "custom", message: t.parentNotFound });
        return z.NEVER;
      }
      return id;
    }),
  });
}

export function validateCategoryForm(
  formData: FormData,
  t: Messages,
):
  | { ok: true; data: CategoryInput; values: CategoryValues }
  | { ok: false; state: CategoryFormState } {
  const get = (key: keyof CategoryValues) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const values = { name: get("name"), parentId: get("parentId") };
  const parsed = categorySchema(t).safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data, values };
  return {
    ok: false,
    state: { errors: z.flattenError(parsed.error).fieldErrors, values },
  };
}
