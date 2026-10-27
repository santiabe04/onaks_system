import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import {
  checkParent,
  descendantIds,
  flattenCategoryTree,
  parentOptions,
  validateCategoryForm,
  type CategoryRow,
} from "./category";

// Alimentos (1) › Perros (2) › Cachorros (3); Accesorios (4) › Correas (5)
const rows: CategoryRow[] = [
  { id: 3, name: "Cachorros", parentId: 2 },
  { id: 1, name: "Alimentos", parentId: null },
  { id: 5, name: "Correas", parentId: 4 },
  { id: 2, name: "Perros", parentId: 1 },
  { id: 4, name: "Accesorios", parentId: null },
];

describe("flattenCategoryTree", () => {
  it("ordena padre e hijas por nombre, con nivel, ruta y cantidad de hijas", () => {
    expect(
      flattenCategoryTree(rows).map((n) => [
        n.path.join(" › "),
        n.depth,
        n.childCount,
      ]),
    ).toEqual([
      ["Accesorios", 1, 1],
      ["Accesorios › Correas", 2, 0],
      ["Alimentos", 1, 1],
      ["Alimentos › Perros", 2, 1],
      ["Alimentos › Perros › Cachorros", 3, 0],
    ]);
  });
});

describe("descendantIds", () => {
  it("incluye todos los niveles de abajo", () => {
    expect(descendantIds(rows, 1)).toEqual(new Set([2, 3]));
    expect(descendantIds(rows, 3)).toEqual(new Set());
  });
});

describe("checkParent", () => {
  it("una categoría nueva va en la raíz o debajo de un nivel 1 o 2", () => {
    expect(checkParent(rows, null, null)).toBeNull();
    expect(checkParent(rows, null, 1)).toBeNull();
    expect(checkParent(rows, null, 2)).toBeNull();
  });

  it("no permite un cuarto nivel", () => {
    expect(checkParent(rows, null, 3)).toBe("tooDeep");
  });

  it("al mover, cuenta los niveles de las descendientes", () => {
    // Perros tiene una hija: debajo de Correas (nivel 2) quedaría en 3 y Cachorros en 4.
    expect(checkParent(rows, 2, 5)).toBe("tooDeep");
    expect(checkParent(rows, 2, 4)).toBeNull();
  });

  it("no permite ser padre de sí misma ni de una ancestra", () => {
    expect(checkParent(rows, 1, 1)).toBe("cycle");
    expect(checkParent(rows, 1, 3)).toBe("cycle");
  });

  it("rechaza un padre que no existe", () => {
    expect(checkParent(rows, null, 99)).toBe("parentNotFound");
  });
});

describe("parentOptions", () => {
  it("para una nueva, todas menos las del último nivel", () => {
    expect(parentOptions(rows, null).map((n) => n.id)).toEqual([4, 5, 1, 2]);
  });

  it("al editar, saca a la categoría, sus descendientes y lo que la dejaría muy profunda", () => {
    expect(parentOptions(rows, 2).map((n) => n.id)).toEqual([4, 1]);
  });
});

describe("validateCategoryForm", () => {
  const t = es.categories.errors;
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  it("sin padre es raíz", () => {
    expect(
      validateCategoryForm(form({ name: " Alimentos " }), t),
    ).toMatchObject({ ok: true, data: { name: "Alimentos", parentId: null } });
  });

  it("lee el padre como número", () => {
    expect(
      validateCategoryForm(form({ name: "Gatos", parentId: "1" }), t),
    ).toMatchObject({ ok: true, data: { parentId: 1 } });
  });

  it("rechaza nombre vacío o padre inválido y devuelve lo tipeado", () => {
    const result = validateCategoryForm(
      form({ name: " ", parentId: "abc" }),
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.state.errors?.name).toEqual([t.nameRequired]);
    expect(result.state.errors?.parentId).toEqual([t.parentNotFound]);
    expect(result.state.values).toEqual({ name: " ", parentId: "abc" });
  });
});
