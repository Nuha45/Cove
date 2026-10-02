// Display copy only: Cove never checks which currencies a seller's QR, link or bank accepts,
// so none of these notes may promise support for the store currency.
export const PAYMENT_CURRENCY_NOTES = {
  qr: {
    label: 'Currency: Seller-defined',
    help: 'The QR provider determines which currencies this QR can accept.',
  },
  link: {
    label: 'Currency: Depends on payment provider',
    help: 'International currencies require the payment provider to support them and may require international payments to be enabled.',
  },
  instructions: {
    label: 'Currency: Seller-defined',
    help: 'Cove does not process these payments.',
  },
  pickup: {
    label: 'Currency: Your store currency',
    help: 'Payment is handled directly by the seller.',
  },
};

export default function PaymentCurrencyNote({ method }) {
  const note = PAYMENT_CURRENCY_NOTES[method];
  if (!note) return null;
  return (
    <span className="payment-currency-note">
      <span className="payment-currency-label">{note.label}</span>
      <span className="payment-currency-help">{note.help}</span>
    </span>
  );
}

export function PaymentCurrencyInfo() {
  return (
    <div className="wide payment-currency-info">
      <span className="payment-currency-info-title">Currency &amp; payment methods</span>
      <p>
        Your store currency controls the prices shown to customers. Payment methods may support
        different currencies depending on the payment provider.
      </p>
    </div>
  );
}
