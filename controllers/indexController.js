const bcrypt = require("bcryptjs");
const db = require("../lib/db");

// GET / — root, redirect ke dashboard atau login
const index = (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  res.redirect("/login");
};

// GET /dashboard — halaman utama setelah login
const dashboard = (req, res) => {
  res.render("dashboard/home", {
    title: "Dashboard"
  });
};

// GET /login — tampilkan form login
const loginPage = (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  // layout: false karena auth/login.ejs adalah halaman full standalone (ada <html> sendiri)
  res.render("auth/login", {
    title: "Login",
    layout: false
  });
};

// POST /login — proses login
const login = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    // Validasi input tidak kosong
    if (!email || !password) {
      req.flash("error", "Email dan password wajib diisi");
      return res.redirect("/login");
    }

    // Cari user berdasarkan email (sesuai kolom di tabel users dari dosen)
    const [users] = await db.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      req.flash("error", "Email atau password salah");
      return res.redirect("/login");
    }

    const user = users[0];

    // Cek password hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      req.flash("error", "Email atau password salah");
      return res.redirect("/login");
    }

    // Ambil role dari model_has_roles (tabel pivot Spatie Laravel)
    const [roles] = await db.query(
      `SELECT r.id, r.name
       FROM roles r
       JOIN model_has_roles mhr ON r.id = mhr.role_id
       WHERE mhr.model_id = ? AND mhr.model_type = 'App\\\\Models\\\\User'
       LIMIT 1`,
      [user.id]
    );

    const role = roles.length > 0
      ? roles[0]
      : { id: null, name: "User" };

    // Ambil semua permissions dari role user
    const [permissions] = await db.query(
      `SELECT DISTINCT p.name
       FROM permissions p
       JOIN role_has_permissions rhp ON p.id = rhp.permission_id
       JOIN model_has_roles mhr ON rhp.role_id = mhr.role_id
       WHERE mhr.model_id = ? AND mhr.model_type = 'App\\\\Models\\\\User'`,
      [user.id]
    );

    // Simpan semua info user ke session
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role_id: role.id,
      role_name: role.name,
      permissions: permissions.map((p) => p.name)
    };

    res.redirect("/dashboard");

  } catch (err) {
    next(err);
  }
};

// GET /logout — hapus session dan redirect ke login
const logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    res.redirect("/login");
  });
};

module.exports = {
  index,
  dashboard,
  loginPage,
  login,
  logout
};
