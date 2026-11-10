import { z } from "zod";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";

// Pure: validation and rules of the category tree (used by the actions, the
// pages and the tests).

/** The root is level 1. */
export const MAX_CATEGORY_DEPTH = 3;
export const CATEGORY_NAME_MAX_LENGTH = 50;

export type CategoryRow = { id: number; name: string; parentId: number | null };

export type CategoryNode = CategoryRow & {
  depth: number;
  /** Names from the root: ["Limpieza", "Pisos"]. */
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

/** The tree flattened in reading order: each category followed by its children, by name. */
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

/** IDs of all the descendants (not including the category itself). */
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
  // The cap avoids an infinite loop if the DB had a cycle.
  while (current && depth <= rows.length) {
    depth++;
    current =
      current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return depth;
}

/** Levels the category occupies with its descendants (1 if it has no children). */
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
 * Whether `parentId` can serve as the parent of category `id` (null if it is new):
 * that it exists, that it is not itself or a descendant, and that the whole
 * subtree stays within the 3 levels.
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
 * Categories that can be chosen as the parent of `id` (null if it is new). Those
 * that have products are left out: only leaf categories can have them.
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

// --- Form ---

type Messages = Dictionary["categories"]["errors"];

export type CategoryValues = { name: string; parentId: string };

export type CategoryFormState = {
  errors?: Partial<Record<keyof CategoryValues | "form", string[]>>;
  values?: CategoryValues;
};

export type CategoryInput = { name: string; parentId: number | null };

// The column is INTEGER (int4): anything out of range cannot exist.
const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** Converts an id from the URL or a form into a number; null if it is not valid. */
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
    // Empty = root category.
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
