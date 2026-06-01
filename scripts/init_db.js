/**
 * Seeder — buat akun test untuk login ke FacultyWare
 *
 * CATATAN:
 * - Tidak membuat tabel baru (tabel sudah ada dari SQL dosen)
 * - Hanya insert data test jika belum ada
 * - Jalankan dengan: node scripts/init_db.js
 */

const db = require('../lib/db');
const bcrypt = require('bcryptjs');

async function init() {
  try {
    console.log('=== FacultyWare Seeder ===\n');

    // Cek apakah ada roles di database
    const [roles] = await db.query('SELECT id, name FROM roles');

    if (roles.length === 0) {
      console.log('⚠ Tidak ada roles di database.');
      console.log('  Pastikan SQL dari dosen sudah diimport ke database.');
      process.exit(1);
    }

    console.log(`✓ Roles ditemukan: ${roles.map(r => r.name).join(', ')}`);

    // Cari role Admin Kepegawaian & Admin Kemahasiswaan
    const roleKepegawaian = roles.find(r =>
      r.name.toLowerCase().includes('kepegawaian')
    );
    const roleKemahasiswaan = roles.find(r =>
      r.name.toLowerCase().includes('kemahasiswaan')
    );

    // Data user test
    const testUsers = [
      {
        name: 'Admin Kepegawaian FTI',
        email: 'admin.kepegawaian@fti.unand.ac.id',
        password: 'Kepegawaian@2026',
        role: roleKepegawaian
      },
      {
        name: 'Admin Kemahasiswaan FTI',
        email: 'admin.kemahasiswaan@fti.unand.ac.id',
        password: 'Kemahasiswaan@2026',
        role: roleKemahasiswaan
      }
    ];

    for (const userData of testUsers) {
      // Cek apakah user sudah ada
      const [existing] = await db.query(
        'SELECT id FROM users WHERE email = ?',
        [userData.email]
      );

      let userId;

      if (existing.length > 0) {
        userId = existing[0].id;
        console.log(`→ User "${userData.email}" sudah ada (id: ${userId})`);
      } else {
        // Insert user baru
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const [result] = await db.query(
          'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
          [userData.name, userData.email, hashedPassword]
        );
        userId = result.insertId;
        console.log(`✓ User "${userData.email}" dibuat (id: ${userId})`);
      }

      // Assign role jika ada
      if (userData.role && userId) {
        // Cek apakah role sudah ter-assign
        const [existingRole] = await db.query(
          `SELECT * FROM model_has_roles
           WHERE model_id = ? AND model_type = 'App\\\\Models\\\\User' AND role_id = ?`,
          [userId, userData.role.id]
        );

        if (existingRole.length === 0) {
          await db.query(
            `INSERT INTO model_has_roles (role_id, model_type, model_id)
             VALUES (?, 'App\\\\Models\\\\User', ?)`,
            [userData.role.id, userId]
          );
          console.log(`  ✓ Role "${userData.role.name}" di-assign ke user`);
        } else {
          console.log(`  → Role "${userData.role.name}" sudah ter-assign`);
        }
      } else {
        console.log(`  ⚠ Role tidak ditemukan untuk user ini`);
      }
    }

    console.log('\n=== Seeder selesai ===');
    console.log('Login dengan:');
    console.log('  Email: admin.kepegawaian@fti.unand.ac.id    | Password: Kepegawaian@2026');
    console.log('  Email: admin.kemahasiswaan@fti.unand.ac.id  | Password: Kemahasiswaan@2026');

    process.exit(0);

  } catch (err) {
    console.error('Error saat seeder:', err);
    process.exit(1);
  }
}

init();
