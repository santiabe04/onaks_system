import { describe, expect, it } from "vitest";
import { csvNumber, toCsv } from "./csv";

describe("toCsv", () => {
  it("arranca con BOM y separa las filas con CRLF", () => {
    expect(
      toCsv(
        [
          ["Pedido", "Cliente"],
          ["1", "Pet Shop Quilmes"],
        ],
        ";",
      ),
    ).toBe("\uFEFFPedido;Cliente\r\n1;Pet Shop Quilmes\r\n");
  });

  it("pone comillas solo cuando hace falta", () => {
    expect(
      toCsv(
        [["Alimento; perro", 'Bolsa "premium"', "Entregar\na la mañana", "ok"]],
        ";",
      ),
    ).toBe(
      '\uFEFF"Alimento; perro";"Bolsa ""premium""";"Entregar\na la mañana";ok\r\n',
    );
  });

  it("con coma de separador, la coma también lleva comillas", () => {
    expect(toCsv([["Quilmes, Buenos Aires", "1"]], ",")).toBe(
      '\uFEFF"Quilmes, Buenos Aires",1\r\n',
    );
  });
});

describe("csvNumber", () => {
  it("usa la coma decimal en español y el punto en inglés", () => {
    expect(csvNumber("63511.50", true)).toBe("63511,50");
    expect(csvNumber("63511.50", false)).toBe("63511.50");
    expect(csvNumber("15", true)).toBe("15");
  });
});
