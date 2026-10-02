// Suggestions only: sellers can also type their own store type (checked on the server).
export const CATEGORIES = [
  'Jewelry & Accessories',
  'Clothing & Fashion',
  'Homemade Food',
  'Bakery & Desserts',
  'Beauty & Skincare',
  'Henna',
  'Art & Crafts',
  'Handmade Gifts',
  'Home Decor',
  'Candles & Fragrances',
  'Plants & Flowers',
  'Books & Stationery',
  'Electronics & Gadgets',
  'Toys & Kids',
  'Pet Supplies',
  'Health & Wellness',
  'Services & Classes',
];

export const CATEGORY_MAX = 40;

export function categoryError(value) {
  const category = String(value || '').trim();
  if (category.length < 2) return 'Choose or type your store type.';
  if (category.length > CATEGORY_MAX) return `Keep your store type under ${CATEGORY_MAX} characters.`;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M} &'’,.()/+-]*$/u.test(category)) {
    return 'Use letters, numbers, spaces and simple punctuation.';
  }
  return '';
}
