import api from './api';
import { downloadFile } from '../utils/download';

export function getAnalytics() {
  return api.get('/analytics').then((res) => res.data);
}

export function getPerformance(params) {
  return api.get('/analytics/performance', { params }).then((res) => res.data);
}

export function getProductPerformance(params) {
  return api.get('/analytics/products', { params }).then((res) => res.data);
}

export function getInsights(params) {
  return api.get('/analytics/insights', { params }).then((res) => res.data);
}

export function getSalesReport(params) {
  return api.get('/analytics/sales-report', { params }).then((res) => res.data);
}

export function downloadOrdersCsv(params) {
  return downloadFile('/analytics/export/orders.csv', params, 'cove-orders.csv');
}

export function downloadProductSalesCsv(params) {
  return downloadFile('/analytics/export/product-sales.csv', params, 'cove-product-sales.csv');
}
