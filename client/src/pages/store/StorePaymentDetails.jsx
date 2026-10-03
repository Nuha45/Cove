import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, QrCode, Smartphone } from 'lucide-react';
import { formatPrice } from '../../utils/display';
import { mediaUrl } from '../../utils/media';
import { paymentMethodLabel } from '../../utils/payments';
import { copyText } from '../../utils/storefront';
import {
  IOS_UPI_APPS,
  buildUpiAppUri,
  buildUpiPayUri,
  detectPaymentPlatform,
  upiQrDataUrl,
} from '../../utils/upi';

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

  const [platform] = useState(() => detectPaymentPlatform());
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState('');
  const copiedTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const plainAmount = Number.isFinite(Number(amount))
    ? Number(amount).toFixed(2).replace(/\.00$/, '')
    : '';

  async function copy(kind, value) {
    window.clearTimeout(copiedTimer.current);
    try {
      await copyText(value);
      setCopyError('');
      setCopied(kind);
      copiedTimer.current = window.setTimeout(() => setCopied(''), 2500);
    } catch {
      setCopied('');
      setCopyError('Could not copy automatically. Press and hold the text to copy it.');
    }
  }

  if (!method) return null;

  if (compact && method === 'cash_on_delivery') {
    return (
      <div className="store-pay-checkout-note">
        <p>
          You will pay <strong>{amountLabel}</strong> in cash to {businessName} when your order is delivered.
          No online payment is needed now.
        </p>
      </div>
    );
  }

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

          {upiId ? (
            <div className="store-pay-recipient">
              <div className="store-pay-recipient-row">
                <div>
                  <span>UPI ID</span>
                  <strong className="store-pay-upi-id">{upiId}</strong>
                </div>
                <button className="secondary" type="button" onClick={() => copy('upi', upiId)}>
                  {copied === 'upi' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                  {copied === 'upi' ? 'Copied' : 'Copy UPI ID'}
                </button>
              </div>
              <div className="store-pay-recipient-row">
                <div>
                  <span>Amount</span>
                  <strong>{amountLabel}</strong>
                </div>
                <button className="secondary" type="button" onClick={() => copy('amount', plainAmount)}>
                  {copied === 'amount' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                  {copied === 'amount' ? 'Copied' : 'Copy amount'}
                </button>
              </div>
              <p className="store-pay-note" role="status" aria-live="polite">
                {copyError || (copied ? 'Copied. Paste it into your UPI app.' : `Paying ${businessName}. Check the name in your UPI app before you approve.`)}
              </p>
            </div>
          ) : null}

          {upiUri ? (
            <>
              {platform === 'android' ? (
                <div className="store-pay-option-block">
                  <a className="primary store-pay-cta" href={upiUri}>
                    <Smartphone size={16} aria-hidden="true" /> Pay with UPI app
                  </a>
                  <p className="store-pay-note">
                    Your phone will ask which UPI app to use. The amount and order number are filled in for you.
                  </p>
                </div>
              ) : null}

              {platform === 'ios' ? (
                <div className="store-pay-option-block">
                  <strong className="store-pay-option-title">Pay with a UPI app</strong>
                  <div className="store-pay-apps">
                    {IOS_UPI_APPS.map((app) => (
                      <a key={app.id} className="secondary" href={buildUpiAppUri(upiUri, app.prefix)}>
                        {app.label}
                      </a>
                    ))}
                  </div>
                  <p className="store-pay-note">
                    Choose an app you have installed. If nothing opens, use <strong>Copy UPI ID</strong> or the QR code instead.
                  </p>
                  <a className="text-button store-pay-other" href={upiUri}>
                    Other UPI app (opens your iPhone&apos;s default UPI app)
                  </a>
                </div>
              ) : null}

              {generatedQr ? (
                <div className="store-pay-option-block">
                  <strong className="store-pay-option-title">
                    <QrCode size={15} aria-hidden="true" /> Scan QR code
                  </strong>
                  <div className="store-pay-qr">
                    <img src={generatedQr} alt={`UPI QR for ${amountLabel} to ${businessName}`} />
                  </div>
                  <p className="store-pay-note">
                    {platform === 'desktop'
                      ? 'Open any UPI app on your phone and scan this code. The amount is filled in for you.'
                      : 'Scan from another phone, or take a screenshot and use “scan from gallery” in your UPI app.'}
                  </p>
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
              {platform !== 'desktop' ? (
                <p className="store-pay-note">
                  Paying on this phone? Take a screenshot and use “scan from gallery” in your UPI app.
                </p>
              ) : null}
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

          {!upiUri && !staticQr && !upiId ? (
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

      {method === 'cash_on_delivery' ? (
        <div className="store-pay-detail">
          <h3>{label}</h3>
          <ol className="store-pay-steps">
            <li>Keep <strong>{amountLabel}</strong> in cash ready.</li>
            <li>Pay {businessName} when your order is delivered.</li>
            <li>The seller marks the order as paid once they receive the cash.</li>
          </ol>
          <p className="store-pay-note">
            No online transfer is required for this option.
          </p>
        </div>
      ) : null}
    </div>
  );
}
