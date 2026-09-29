const asyncHandler = require('../utils/asyncHandler');
const invoiceService = require('../services/invoiceService');

function sendPdf(res, invoice, pdf, download) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${invoice.invoiceNumber}.pdf"`
  );
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
}

const list = asyncHandler(async (req, res) => {
  const result = await invoiceService.list(req.businessId, {
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search,
  });
  res.json({
    invoices: result.invoices.map((invoice) => invoice.toPublic()),
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
});

const getPdf = asyncHandler(async (req, res) => {
  const { invoice, pdf } = await invoiceService.pdfForInvoiceId(req.businessId, req.params.id);
  sendPdf(res, invoice, pdf, req.query.download === '1');
});

const getForOrder = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.ensureInvoiceForOrder(req.businessId, req.params.id);
  res.json({ invoice: invoice.toPublic() });
});

const getOrderPdf = asyncHandler(async (req, res) => {
  const { invoice, pdf } = await invoiceService.pdfForOrder(req.businessId, req.params.id);
  sendPdf(res, invoice, pdf, req.query.download === '1');
});

module.exports = {
  list,
  getPdf,
  getForOrder,
  getOrderPdf,
};
