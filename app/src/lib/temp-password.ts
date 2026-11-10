// Pure: temporary passwords the system generates when creating or resetting a
// user. The admin sees them only once and passes them to the person (WhatsApp,
// phone); on first login they must be changed.

// No characters that get confused when dictated or read (0/O, 1/l/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const GROUPS = 3;
const GROUP_LENGTH = 4;

type RandomSource = (bytes: Uint8Array) => Uint8Array;

const cryptoRandom: RandomSource = (bytes) => crypto.getRandomValues(bytes);

/**
 * "Kx7p-Qm4r-Zt9w": 12 random characters (~70 bits) in groups of 4, easy to
 * dictate. Rejection sampling: each character is equally likely (without the bias
 * of using `byte % 57` over the 256 values of a byte).
 */
export function generateTempPassword(
  random: RandomSource = cryptoRandom,
): string {
  const chars: string[] = [];
  // The largest multiple of the alphabet length (57) that fits in a byte: 228.
  // What falls above it is discarded.
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
