import { Banknote, ExternalLink, FileText, Package, QrCode } from 'lucide-react';
import { getDefaultCurrency } from './display';

export const PAYMENT_METHODS = ['qr', 'payment_link', 'instructions', 'pay_on_pickup', 'cash_on_delivery'];

export function paymentMethodLabel(method, currency = getDefaultCurrency()) {
  const india = currency === 'INR';
  switch (method) {
    case 'qr':
      return india ? 'UPI / QR code' : 'QR code';
    case 'payment_link':
      return india ? 'UPI / payment link' : 'Payment link';
    case 'instructions':
      return 'Payment instructions';
    case 'pay_on_pickup':
      return 'Pay on pickup';
    case 'cash_on_delivery':
      return 'Cash on delivery';
    default:
      return 'Not selected';
  }
}

export function paymentMethodHint(method, currency = 'INR') {
  const india = currency === 'INR';
  switch (method) {
    case 'qr':
      return india
        ? 'Pay with a UPI app using the order amount — details appear after you place the order.'
        : 'Scan the seller\'s QR code to pay.';
    case 'payment_link':
      return india
        ? 'Open the seller\'s UPI or payment link after placing the order.'
        : 'Open the seller\'s payment link in a new tab.';
    case 'instructions':
      return 'Follow the seller\'s written payment steps.';
    case 'pay_on_pickup':
      return 'Pay the seller when you collect your order.';
    case 'cash_on_delivery':
      return 'Pay in cash when your order is delivered.';
    default:
      return '';
  }
}

export function paymentMethodIcon(method) {
  switch (method) {
    case 'qr':
      return QrCode;
    case 'payment_link':
      return ExternalLink;
    case 'instructions':
      return FileText;
    case 'pay_on_pickup':
      return Package;
    case 'cash_on_delivery':
      return Banknote;
    default:
      return FileText;
  }
}

export function enabledCheckoutMethods(payments, deliveryMethod, currency = 'INR') {
  if (!payments) return [];
  const options = [];
  if (payments.qrEnabled) {
    options.push({
      value: 'qr',
      label: paymentMethodLabel('qr', currency),
      hint: paymentMethodHint('qr', currency),
    });
  }
  if (payments.linkEnabled) {
    options.push({
      value: 'payment_link',
      label: paymentMethodLabel('payment_link', currency),
      hint: paymentMethodHint('payment_link', currency),
    });
  }
  if (payments.instructionsEnabled) {
    options.push({
      value: 'instructions',
      label: paymentMethodLabel('instructions', currency),
      hint: paymentMethodHint('instructions', currency),
    });
  }
  if (payments.payOnPickupEnabled && deliveryMethod !== 'Delivery') {
    options.push({
      value: 'pay_on_pickup',
      label: paymentMethodLabel('pay_on_pickup', currency),
      hint: paymentMethodHint('pay_on_pickup', currency),
    });
  }
  if (payments.cashOnDeliveryEnabled && deliveryMethod === 'Delivery') {
    options.push({
      value: 'cash_on_delivery',
      label: paymentMethodLabel('cash_on_delivery', currency),
      hint: paymentMethodHint('cash_on_delivery', currency),
    });
  }
  return options;
}

/** Customer-facing explanation of payment status. Never implies Cove verified a transfer. */
export function paymentStatusCustomerCopy(status, method = '') {
  if (method === 'cash_on_delivery' && ['Payment Pending', 'Pending'].includes(status)) {
    return 'Pay in cash when your order is delivered. The seller marks it paid once they receive the cash.';
  }
  switch (status) {
    case 'Paid':
      return 'The seller confirmed they received your payment.';
    case 'Payment Submitted':
      return 'You submitted a payment reference. The seller still needs to confirm it — this is not verified payment yet.';
    case 'Payment Rejected':
      return 'The seller could not match your payment. Check the details and contact them if you already paid.';
    case 'Payment Pending':
    case 'Pending':
    default:
      return 'Payment is still pending. Pay the seller directly, then optionally share a reference so they can match it.';
  }
}
