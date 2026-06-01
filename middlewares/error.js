var createError = require('http-errors');

// catch 404 and forward to error handler
const notFoundHandler = (req, res, next) => {
  next(createError(404));
};

// error handler
const errorHandler = (err, req, res, next) => {
  // Jika headers sudah dikirim (misal setelah redirect), jangan coba render lagi
  if (res.headersSent) {
    return next(err);
  }

  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  const status = err.status || 500;
  res.status(status);

  if (status === 404) {
    return res.render('errors/404', { layout: false });
  }

  if (status === 403) {
    return res.render('errors/403', { layout: false });
  }

  res.render('errors/500', { layout: false });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
