const db = require("../lib/db");

/**
 * ACL Middleware — cek permission user.
 *
 * Menggunakan tabel model_has_roles (Spatie Laravel Permission).
 * model_type = 'App\\Models\\User' (sesuai konvensi Laravel)
 *
 * @param {string|string[]} requiredPermissions
 */
const checkPermission = (requiredPermissions) => {
  return async (req, res, next) => {
    // Cek apakah user sudah login
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const permissionsArray = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];

    try {
      const query = `
        SELECT DISTINCT p.name
        FROM permissions p
        JOIN role_has_permissions rhp ON p.id = rhp.permission_id
        JOIN model_has_roles mhr ON rhp.role_id = mhr.role_id
        WHERE mhr.model_id = ?
          AND mhr.model_type = 'App\\\\Models\\\\User'
          AND p.name IN (?)
      `;

      const [rows] = await db.query(query, [
        req.session.user.id,
        permissionsArray
      ]);

      if (rows.length > 0) {
        return next();
      }

      // Tidak punya permission → render errors/403
      res.status(403).render("errors/403", { layout: false });

    } catch (err) {
      next(err);
    }
  };
};

module.exports = {
  checkPermission
};
