export const EMPTY_ADDRESS = {
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  postalCode: '',
};

export function addressErrors(address, { requirePostalCode = false } = {}) {
  const errors = {};
  if (address.addressLine1.trim().length < 2) {
    errors.addressLine1 = 'Please enter your house / flat number and building.';
  }
  if (address.addressLine2.trim().length < 2) {
    errors.addressLine2 = 'Please enter your street, area or locality.';
  }
  if (address.city.trim().length < 2) errors.city = 'Please enter your city.';
  const postal = address.postalCode.trim();
  if (requirePostalCode && !/^[1-9][0-9]{5}$/.test(postal)) {
    errors.postalCode = 'Please enter a valid 6-digit pincode.';
  } else if (!requirePostalCode && postal && !/^[A-Za-z0-9 -]{3,10}$/.test(postal)) {
    errors.postalCode = 'Please enter a valid postal code.';
  }
  return errors;
}

// One line per part so the seller reads it like a shipping label.
export function formatAddress(address) {
  const city = [address.city.trim(), address.postalCode.trim()].filter(Boolean).join(' - ');
  return [
    address.addressLine1.trim(),
    address.addressLine2.trim(),
    address.landmark.trim() ? `Landmark: ${address.landmark.trim()}` : '',
    city,
  ]
    .filter(Boolean)
    .join('\n');
}
