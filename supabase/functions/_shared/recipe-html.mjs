import * as cheerio from 'cheerio/slim';
import { Parser } from 'htmlparser2';

// Preflight and DOM construction use the same HTML parser semantics. In
// particular, <div/> cannot hide an open HTML element from the depth budget.
// This streaming pass creates no DOM and stops hostile nesting before allocation.
export function loadRecipeHtml(html, fragment = false) {
  if (typeof html !== 'string' || html.length > 2 * 1024 * 1024)
    throw new Error('The webpage is too large.');
  let depth = 0;
  let elements = 0;
  const parser = new Parser(
    {
      onopentag() {
        if (++depth > 128 || ++elements > 20_000)
          throw new Error('The webpage is too complex to import safely.');
      },
      onclosetag() {
        depth--;
      },
    },
    { xmlMode: false, decodeEntities: false },
  );
  parser.end(html);
  return cheerio.load(html, { xmlMode: false }, !fragment);
}
