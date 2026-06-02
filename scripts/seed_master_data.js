const db = require('../lib/db');

async function seedMasterData() {
  try {
    console.log('=== Seeding Master Data ===\n');

    // 1. Seed Employment Statuses
    console.log('Menyiapkan data Status Kepegawaian...');
    const statuses = [
      { name: 'PNS', description: 'Pegawai Negeri Sipil' },
      { name: 'CPNS', description: 'Calon Pegawai Negeri Sipil' },
      { name: 'PPPK', description: 'Pegawai Pemerintah dengan Perjanjian Kerja' },
      { name: 'Honorer', description: 'Pegawai Honorer' },
      { name: 'Kontrak', description: 'Pegawai Kontrak' }
    ];

    for (const status of statuses) {
      const [existing] = await db.query('SELECT id FROM employment_statuses WHERE name = ?', [status.name]);
      if (existing.length === 0) {
        await db.query('INSERT INTO employment_statuses (name, description, created_at, updated_at) VALUES (?, ?, NOW(), NOW())', 
        [status.name, status.description]);
        console.log(`✓ Ditambahkan status: ${status.name}`);
      } else {
        console.log(`→ Status "${status.name}" sudah ada.`);
      }
    }
    console.log('');

    // 2. Seed Organization Units
    console.log('Menyiapkan data Unit Organisasi...');
    
    // Hapus data lama agar sesuai dengan request (hanya 3 departemen)
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    await db.query('TRUNCATE TABLE organization_units');
    await db.query('SET FOREIGN_KEY_CHECKS = 1');

    const units = [
      { name: 'Departemen Teknik Komputer', code: 'DTK', type: 'department', parent_id: null },
      { name: 'Departemen Sistem Informasi', code: 'DSI', type: 'department', parent_id: null },
      { name: 'Departemen Informatika', code: 'DIF', type: 'department', parent_id: null }
    ];

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      await db.query(
        `INSERT INTO organization_units 
         (name, code, type, parent_id, organization_unit_id, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`, 
        [unit.name, unit.code, unit.type, unit.parent_id, 1]
      );
      console.log(`✓ Ditambahkan unit: ${unit.name} (${unit.code})`);
    }

    console.log('\n=== Seeding selesai ===');
    process.exit(0);

  } catch (err) {
    console.error('Error saat seeding:', err);
    process.exit(1);
  }
}

seedMasterData();
