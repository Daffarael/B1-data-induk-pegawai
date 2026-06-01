var express = require("express");
var router = express.Router();
const indexController = require("../controllers/indexController");
const { isAuthenticated } = require("../middlewares/auth");

// GET / — root, redirect ke dashboard atau login
router.get("/", indexController.index);

// GET /dashboard — halaman utama (protected)
router.get("/dashboard", isAuthenticated, indexController.dashboard);

// GET /login — form login
router.get("/login", indexController.loginPage);

// POST /login — proses login
router.post("/login", indexController.login);

// GET /logout — proses logout
router.get("/logout", indexController.logout);

module.exports = router;
