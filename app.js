require('dotenv').config();
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
var MySQLStore = require('express-mysql-session')(session);
var ejsLayouts = require('express-ejs-layouts');
var flash = require('connect-flash');
var methodOverride = require('method-override');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

// --- Route Data Pegawai & Dosen (Daffarael) ---
var pegawaiRouter = require('./routes/pegawai');
var apiPegawaiRouter = require('./routes/api/pegawai');

// --- Route Struktur Jabatan (Luthfi) ---
var strukturJabatanRouter = require('./routes/strukturJabatan');
var apiStrukturJabatanRouter = require('./routes/api/strukturJabatan');

// --- Route Nomenklatur (Firza) ---
var nomenklaturRouter = require('./routes/nomenklatur');
var apiNomenklaturRouter = require('./routes/api/nomenklatur');

// --- Route Mahasiswa (Ayesah) ---
var mahasiswaRouter = require('./routes/mahasiswa');
var apiMahasiswaRouter = require('./routes/api/mahasiswa');

// --- Route SBM Perjalanan Dinas (Tasya) ---
var sbmRouter = require('./routes/sbm');
var apiSbmRouter = require('./routes/api/sbm');

const { notFoundHandler, errorHandler } = require('./middlewares/error');

var app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// EJS Layouts — semua view pakai views/layouts/main.ejs secara default
app.use(ejsLayouts);
app.set('layout', 'layouts/main');

app.use(logger('dev'));
// Disable HTTP caching in development so EJS changes always take effect
if (app.get('env') === 'development') {
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(methodOverride(function (req, res) {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    var method = req.body._method;
    delete req.body._method;
    return method;
  }
}));
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

// Register Route Daffarael
app.use('/pegawai', pegawaiRouter);
app.use('/api', apiPegawaiRouter);

// Register Route Luthfi
app.use('/struktur-jabatan', strukturJabatanRouter);
app.use('/api/struktur-jabatan', apiStrukturJabatanRouter);

// Register Route Firza
app.use('/nomenklatur', nomenklaturRouter);
app.use('/api/nomenklatur', apiNomenklaturRouter);

// Register Route Ayesah
app.use('/mahasiswa', mahasiswaRouter);
app.use('/api/mahasiswa', apiMahasiswaRouter);

// Register Route Tasya
app.use('/sbm', sbmRouter);
app.use('/api/sbm', apiSbmRouter);

// catch 404 and forward to error handler
app.use(notFoundHandler);

// error handler
app.use(errorHandler);

module.exports = app;