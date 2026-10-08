const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** Spell out zero through nine and use numerals from 10, as the house style asks. */
export const num = (n) => (Number.isInteger(n) && n >= 0 && n <= 9 ? WORDS[n] : String(n));

/** "one story", "three stories". */
export const plural = (n, word, many = `${word}s`) => `${num(n)} ${n === 1 ? word : many}`;

export const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
