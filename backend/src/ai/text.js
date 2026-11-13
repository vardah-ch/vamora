'use strict';

/**
 * Text normalisation for personal-memory retrieval.
 *
 * Deliberately simple and transparent: Unicode-aware tokenisation (works for
 * Urdu/Arabic script as well as Latin), a small English stopword list, a light
 * suffix stemmer, and a hand-written kinship/relationship lexicon used for
 * query expansion (e.g. "daughter" ↔ "child", "ammi" ↔ "mother").
 */

const STOPWORDS = new Set(`a an and are as at be been but by can could did do does doing for from had has have he her
here hers him his how i if in into is it its just me my myself no nor not now of on or our ours out over own she
should so some such than that the their theirs them then there these they this those through to too under up very
was we were what when where which while who whom why will with would you your yours yourself tell remind remember
about again please know think show let us any something anything thing things cara hi hello`.split(/\s+/));

/** Kinship and everyday-concept groups used for query expansion (EN + common romanised Urdu). */
const CONCEPT_GROUPS = [
  ['daughter', 'son', 'child', 'children', 'kid', 'kids', 'beta', 'beti'],
  ['grandson', 'granddaughter', 'grandchild', 'grandchildren', 'grandkid', 'pota', 'poti', 'nawasa', 'nawasi'],
  ['mother', 'mom', 'mum', 'mama', 'ammi', 'ammi jaan', 'maa'],
  ['father', 'dad', 'papa', 'abbu', 'abba'],
  ['wife', 'husband', 'spouse', 'partner', 'married', 'wedding', 'shaadi', 'begum'],
  ['brother', 'sister', 'sibling', 'bhai', 'behen', 'baji'],
  ['grandmother', 'grandma', 'nani', 'dadi'],
  ['grandfather', 'grandpa', 'nana', 'dada'],
  ['friend', 'friends', 'dost', 'neighbour', 'neighbor'],
  ['dog', 'cat', 'pet', 'puppy', 'kitten', 'bird', 'parrot'],
  ['home', 'house', 'ghar', 'garden', 'kitchen', 'room'],
  ['medicine', 'medication', 'pill', 'pills', 'tablet', 'dawai'],
  ['doctor', 'clinic', 'hospital', 'appointment', 'checkup'],
  ['pray', 'prayer', 'namaz', 'mosque', 'masjid', 'church'],
  ['eat', 'food', 'breakfast', 'lunch', 'dinner', 'meal', 'khana', 'tea', 'chai'],
  ['walk', 'walking', 'park', 'stroll'],
  ['sleep', 'bed', 'bedtime', 'nap', 'night'],
  ['birthday', 'party', 'celebration', 'cake', 'eid', 'festival'],
  ['visit', 'visited', 'came', 'see', 'saw', 'met', 'meet']
];

function normalize(text) {
  return String(text || '').normalize('NFKC').toLowerCase();
}

/** Light English suffix stemmer (conservative; leaves short and non-Latin tokens alone). */
function stem(token) {
  if (token.length <= 4 || !/^[a-z]+$/.test(token)) return token;
  if (token.endsWith('ies') && token.length > 5) return token.slice(0, -3) + 'y';
  if (token.endsWith('ing') && token.length > 6) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 5) return token.slice(0, -2);
  if (token.endsWith('es') && /(ches|shes|sses|xes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function rawTokens(text) {
  return normalize(text).match(/[\p{L}\p{N}]+/gu) || [];
}

function tokenize(text) {
  return rawTokens(text).filter(t => !STOPWORDS.has(t) && (t.length > 1 || /\d/.test(t))).map(stem);
}

const CONCEPT_INDEX = new Map();
CONCEPT_GROUPS.forEach((group, gi) => group.forEach(w => {
  for (const t of tokenize(w)) CONCEPT_INDEX.set(t, gi);
}));

/** Related terms for query expansion (excludes the term itself). */
function expansions(token) {
  const gi = CONCEPT_INDEX.get(token);
  if (gi === undefined) return [];
  return [...new Set(CONCEPT_GROUPS[gi].flatMap(w => tokenize(w)))].filter(t => t !== token);
}

/** Words that look like proper names in mixed-case text (used for person matching). */
function capitalizedTerms(text) {
  return (String(text || '').match(/\b[A-Z][a-z]{2,}\b/g) || []).map(w => w.toLowerCase());
}

module.exports = { STOPWORDS, CONCEPT_GROUPS, normalize, stem, rawTokens, tokenize, expansions, capitalizedTerms };
