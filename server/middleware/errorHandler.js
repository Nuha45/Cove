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

  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    message: statusCode >= 500 ? 'Something went wrong. Please try again.' : err.message,
    errors: err.errors,
  });
}

module.exports = errorHandler;
