import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Smartphone } from 'lucide-react';
import { formatPrice } from '../../utils/display';
import { mediaUrl } from '../../utils/media';
import { paymentMethodLabel } from '../../utils/payments';
import { buildUpiPayUri, upiQrDataUrl } from '../../utils/upi';

/**
 * Shared seller-direct payment details for checkout and confirmation.
 * Does not verify payment — display and guidance only.
 */
export default function StorePaymentDetails({
  method,
  payments,
  businessName = 'the seller',
  amount,
  currency = 'INR',
  heading = 'Pay this amount',
  orderNumber = '',
  compact = false,
}) {
  const amountLabel = formatPrice(amount, currency);
  const label = paymentMethodLabel(method, currency);
  const upiId = payments?.upiId || '';
  const staticQr = payments?.paymentQrImage || '';

  const upiUri = useMemo(() => {
    if (method !== 'qr' || !upiId || currency !== 'INR' || !orderNumber) return '';
    return buildUpiPayUri({
      upiId,
      payeeName: businessName,
      amount,
      currency,
      transactionNote: orderNumber,
    });
  }, [method, upiId, currency, orderNumber, businessName, amount]);

  const [generatedQr, setGeneratedQr] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function makeQr() {
      if (!upiUri) {
        if (!cancelled) setGeneratedQr('');
        return;
      }
      const dataUrl = await upiQrDataUrl(upiUri);
      if (!cancelled) setGeneratedQr(dataUrl);
    }
    makeQr();
    return () => {
      cancelled = true;
    };
  }, [upiUri]);

  if (!method) return null;

  if (compact) {
    return (
      <div className="store-pay-checkout-note">
        <p>
          You will pay <strong>{amountLabel}</strong> to {businessName} after you place this order.
          Payment details for <strong>{label}</strong> appear on the confirmation page — placing the order
          is not proof of payment.
        </p>
      </div>
    );
  }

  return (
    <div className="store-pay-panel">
      <div className="store-pay-amount">
        <span>{heading}</span>
        <strong>{amountLabel}</strong>
        <small>Pay {businessName} directly · Cove does not collect or verify this payment</small>
      </div>

      {method === 'qr' ? (
        <div className="store-pay-detail">
          <h3>{label}</h3>

          {upiUri ? (
            <>
              <ol className="store-pay-steps">
                <li>Tap <strong>Pay with UPI</strong> to open your UPI app with the amount filled in.</li>
                <li>Or scan the QR below from another phone.</li>
                <li>
                  Before you authorize, check that the recipient is <strong>{businessName}</strong>
                  {upiId ? <> ({upiId})</> : null} and the amount is <strong>{amountLabel}</strong>.
                </li>
              </ol>
              <a className="primary store-pay-cta" href={upiUri}>
                <Smartphone size={16} aria-hidden="true" /> Pay with UPI
              </a>
              {generatedQr ? (
                <div className="store-pay-qr">
                  <img src={generatedQr} alt={`UPI QR for ${amountLabel} to ${businessName}`} />
                </div>
              ) : null}
              {orderNumber ? (
                <p className="store-pay-note">
                  Order <strong>{orderNumber}</strong> is included as the payment note when your app supports it.
                  This helps the seller match your transfer — it does not prove payment to Cove.
                </p>
              ) : null}
            </>
          ) : null}

          {!upiUri && staticQr ? (
            <>
              <ol className="store-pay-steps">
                <li>Open your UPI or banking app.</li>
                <li>Scan the QR below.</li>
                <li>Confirm the amount is <strong>{amountLabel}</strong> before you send.</li>
              </ol>
              <div className="store-pay-qr">
                <img src={mediaUrl(staticQr)} alt={`${businessName} payment QR`} />
              </div>
            </>
          ) : null}

          {upiUri && staticQr ? (
            <details className="store-pay-fallback">
              <summary>Seller&apos;s uploaded QR (fallback)</summary>
              <div className="store-pay-qr">
                <img src={mediaUrl(staticQr)} alt={`${businessName} uploaded payment QR`} />
              </div>
              <p className="store-pay-note">
                Use this if the UPI button or generated QR does not open on your device. Enter
                {' '}<strong>{amountLabel}</strong> yourself.
              </p>
            </details>
          ) : null}

          {!upiUri && !staticQr ? (
            <p className="store-pay-note">
              This shop has not published UPI details yet. Contact {businessName} about how to pay.
            </p>
          ) : null}

          <p className="store-pay-note">
            After paying, share your UPI reference or UTR below so the seller can match your transfer.
            Submitting a reference does not automatically mark the order as paid.
          </p>
        </div>
      ) : null}

      {method === 'payment_link' && payments?.paymentLink ? (
        <div className="store-pay-detail">
          <h3>{label}</h3>
          <ol className="store-pay-steps">
            <li>Open the seller&apos;s payment link.</li>
            <li>Pay exactly <strong>{amountLabel}</strong>.</li>
            <li>Keep the transaction ID if your app shows one.</li>
          </ol>
          <a className="primary store-pay-cta" href={payments.paymentLink} target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> Open payment link
          </a>
          <p className="store-pay-note">
            The link opens in a new tab. Cove cannot see whether the payment went through.
          </p>
        </div>
      ) : null}

      {method === 'instructions' && payments?.paymentInstructions ? (
        <div className="store-pay-detail">
          <h3>{label}</h3>
          <p className="store-pay-lead">
            Pay <strong>{amountLabel}</strong> using the seller&apos;s instructions:
          </p>
          <div className="store-pay-instructions">{payments.paymentInstructions}</div>
          <p className="store-pay-note">
            Follow every step carefully. Submitting a reference later does not automatically mark the order as paid.
          </p>
        </div>
      ) : null}

      {method === 'pay_on_pickup' ? (
        <div className="store-pay-detail">
          <h3>{label}</h3>
          <ol className="store-pay-steps">
            <li>Place your order as usual.</li>
            <li>Bring <strong>{amountLabel}</strong> when you collect it.</li>
            <li>Pay {businessName} at pickup — cash or whatever they accept in person.</li>
          </ol>
          <p className="store-pay-note">
            No online transfer is required for this option.
          </p>
        </div>
      ) : null}
    </div>
  );
}
