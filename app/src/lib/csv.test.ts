import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

const BOM = String.fromCharCode(0xfeff);

describe("toCsv", () => {
  it("separa con el separador pedido, con BOM y CRLF", () => {
    expect(
      toCsv(
        [
          ["Pedido", "Cliente", "Total"],
          [1, "Pet Shop Quilmes", "63511,50"],
        ],
        ";",
      ),
    ).toBe(`${BOM}Pedido;Cliente;Total\r\n1;Pet Shop Quilmes;63511,50\r\n`);
  });

  it("pone comillas cuando la celda tiene el separador, comillas o saltos", () => {
    const cells = ['Alimento "premium"', "Zapiola 450; PB", "línea 1\nlínea 2"];
    expect(toCsv([cells], ";")).toBe(
      `${BOM}"Alimento ""premium""";"Zapiola 450; PB";"línea 1\nlínea 2"\r\n`,
    );
    // Con coma de separador, un decimal con coma también va entre comillas.
    expect(toCsv([["1,5"]], ",")).toBe(`${BOM}"1,5"\r\n`);
  });

  it("deja las celdas vacías y neutraliza fórmulas", () => {
    expect(toCsv([[null, undefined, "=HYPERLINK(1)", "-3"]], ";")).toBe(
      `${BOM};;'=HYPERLINK(1);'-3\r\n`,
    );
  });
});
