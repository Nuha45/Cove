// A shop's category is the store type the seller picks from suggestions or types themselves.
// It is display-only free text, so it is checked by shape rather than against a fixed list.
const CATEGORY_MIN = 2;
const CATEGORY_MAX = 40;
// Letters (any language), numbers, spaces and simple punctuation. No markup characters.
const CATEGORY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} &'’,.()/+-]*$/u;

module.exports = { CATEGORY_MIN, CATEGORY_MAX, CATEGORY_PATTERN };
