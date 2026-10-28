// Puro: contraseñas temporales que genera el sistema al crear o blanquear un
// usuario. El admin las ve una sola vez y se las pasa a la persona (WhatsApp,
// teléfono); en el primer ingreso hay que cambiarlas.

// Sin caracteres que se confunden al dictarlos o leerlos (0/O, 1/l/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const GROUPS = 3;
const GROUP_LENGTH = 4;

type RandomSource = (bytes: Uint8Array) => Uint8Array;

const cryptoRandom: RandomSource = (bytes) => crypto.getRandomValues(bytes);

/**
 * "Kx7p-Qm4r-Zt9w": 12 caracteres al azar (~70 bits) en grupos de 4, fáciles de
 * dictar. Muestreo por rechazo: cada carácter es igual de probable (sin el sesgo
 * de usar `byte % 57` sobre los 256 valores de un byte).
 */
export function generateTempPassword(
  random: RandomSource = cryptoRandom,
): string {
  const chars: string[] = [];
  // El mayor múltiplo del largo del alfabeto (57) que entra en un byte: 228.
  // Lo que cae arriba se descarta.
  const limit = 256 - (256 % ALPHABET.length);
  while (chars.length < GROUPS * GROUP_LENGTH) {
    for (const byte of random(new Uint8Array(16))) {
      if (byte < limit && chars.length < GROUPS * GROUP_LENGTH) {
        chars.push(ALPHABET[byte % ALPHABET.length]);
      }
    }
  }
  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i++) {
    groups.push(chars.slice(i * GROUP_LENGTH, (i + 1) * GROUP_LENGTH).join(""));
  }
  return groups.join("-");
}
