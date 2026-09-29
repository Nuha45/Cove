import api from './api';
import { downloadFile, openPdf } from '../utils/download';

export function listInvoices(params) {
  return api.get('/invoices', { params }).then((res) => res.data);
}

export function getOrderInvoice(orderId) {
  return api.get(`/orders/${orderId}/invoice`).then((res) => res.data);
}

export function viewOrderInvoice(orderId) {
  return openPdf(`/orders/${orderId}/invoice/pdf`);
}

export function downloadOrderInvoice(orderId, invoiceNumber) {
  return downloadFile(`/orders/${orderId}/invoice/pdf`, { download: 1 }, `${invoiceNumber || 'invoice'}.pdf`);
}

export function viewInvoice(invoiceId) {
  return openPdf(`/invoices/${invoiceId}/pdf`);
}

export function downloadInvoice(invoiceId, invoiceNumber) {
  return downloadFile(`/invoices/${invoiceId}/pdf`, { download: 1 }, `${invoiceNumber || 'invoice'}.pdf`);
}
