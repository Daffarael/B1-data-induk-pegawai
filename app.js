require('dotenv').config();
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
var MySQLStore = require('express-mysql-session')(session);
var ejsLayouts = require('express-ejs-layouts');
var flash = require('connect-flash');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var pegawaiRouter = require('./routes/pegawai');
var apiPegawaiRouter = require('./routes/api/pegawai');

// --- Route Struktur Jabatan (Luthfi) ---
var strukturJabatanRouter = require('./routes/strukturJabatan');
var apiStrukturJabatanRouter = require('./routes/api/strukturJabatan');

const { notFoundHandler, errorHandler } = require('./middlewares/error');

var app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// EJS Layouts — semua view pakai views/layouts/main.ejs secara default
app.use(ejsLayouts);
app.set('layout', 'layouts/main');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  createDatabaseTable: true,
  schema: {
    tableName: 'express_sessions'
  }
});

app.use(session({
  key: 'session_cookie_name',
  secret: process.env.SESSION_SECRET || 'secret',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

// Flash messages 
app.use(flash());

// Global variables 
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// --- Register Routes ---
app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/pegawai', pegawaiRouter);
app.use('/api', apiPegawaiRouter);

// Register Route Luthfi
app.use('/struktur-jabatan', strukturJabatanRouter);
app.use('/api/struktur-jabatan', apiStrukturJabatanRouter);

// catch 404 and forward to error handler
app.use(notFoundHandler);

// error handler
app.use(errorHandler);

module.exports = app;