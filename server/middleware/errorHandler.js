function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'That request was not valid. Please try again.' });
    return;
  }

  if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
    res.status(400).json({ message: 'That upload is too large. Please use a smaller image.' });
    return;
  }

  if (req.path.startsWith('/uploads/') && (err.code === 'ENOENT' || err.status === 404)) {
    res.status(404).json({ message: 'We could not find that image.' });
    return;
  }

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((item) => ({
      field: item.path,
      message: item.message,
    }));
    res.status(400).json({ message: 'Please check the form and try again.', errors });
    return;
  }

  if (err.code === 11000) {
    res.status(409).json({ message: 'That value is already in use.' });
    return;
  }

  const trusted = Boolean(err.statusCode);
  // Library errors (body parser, aborted requests) carry a 4xx `status` but text that isn't meant for users.
  const clientStatus = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : null;
  const statusCode = err.statusCode || clientStatus || 500;
  if (statusCode >= 500) {
    // Never log secrets; ApiError messages are already safe for operators.
    console.error(trusted ? `[api ${statusCode}] ${err.message}` : err);
  }

  res.status(statusCode).json({
    message: trusted
      ? err.message
      : statusCode >= 500
        ? 'Something went wrong. Please try again.'
        : 'That request was not valid. Please try again.',
    // Only ApiError field details are meant for the browser.
    errors: trusted ? err.errors : undefined,
  });
}

module.exports = errorHandler;
