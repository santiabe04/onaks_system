import { notFound } from "next/navigation";

// Toda URL pasa por el proxy y queda bajo `[lang]`: las que no existen caen acá
// para usar el not-found traducido en vez del 404 por defecto de Next.
export default function CatchAll() {
  notFound();
}
