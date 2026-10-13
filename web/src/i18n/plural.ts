/**
 * "1 item", "3 itens": the count and the right form of the word, so no text says "item(s)".
 * Singular for exactly one, plural otherwise (zero included), which is the rule in English,
 * Portuguese and German alike. Catalogue functions use it: `(n: number) => plural(n, 'block', 'blocks')`.
 */
export const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
