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

    console.log('\n=== 3. Seeding Employee Grades (Golongan) ===');
    const grades = [
      'Golongan I/a', 'Golongan I/b', 'Golongan I/c', 'Golongan I/d',
      'Golongan II/a', 'Golongan II/b', 'Golongan II/c', 'Golongan II/d',
      'Golongan III/a', 'Golongan III/b', 'Golongan III/c', 'Golongan III/d',
      'Golongan IV/a', 'Golongan IV/b', 'Golongan IV/c', 'Golongan IV/d', 'Golongan IV/e'
    ];
    for (const grade of grades) {
      const [existing] = await db.query('SELECT id FROM employee_grades WHERE name = ?', [grade]);
      if (existing.length === 0) {
        await db.query('INSERT INTO employee_grades (name, created_at, updated_at) VALUES (?, NOW(), NOW())', [grade]);
        console.log(`✓ Ditambahkan Golongan: ${grade}`);
      } else {
        console.log(`→ Golongan "${grade}" sudah ada.`);
      }
    }

    console.log('\n=== 4. Seeding Travel Cost Components (Komponen Biaya) ===');
    const components = [
      { name: 'Uang Harian', code: 'UH', desc: 'Uang harian perjalanan dinas' },
      { name: 'Uang Penginapan', code: 'UP', desc: 'Biaya hotel / penginapan' },
      { name: 'Uang Representasi', code: 'UR', desc: 'Uang representasi pejabat' },
      { name: 'Tiket Pesawat / Transportasi', code: 'TP', desc: 'Biaya tiket perjalanan' },
      { name: 'Taksi / Transport Lokal', code: 'TL', desc: 'Biaya taksi dari/ke bandara' }
    ];
    for (const comp of components) {
      const [existing] = await db.query('SELECT id FROM travel_cost_components WHERE code = ?', [comp.code]);
      if (existing.length === 0) {
        await db.query('INSERT INTO travel_cost_components (name, code, description, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())', 
        [comp.name, comp.code, comp.desc]);
        console.log(`✓ Ditambahkan Komponen: ${comp.name}`);
      } else {
        console.log(`→ Komponen "${comp.name}" sudah ada.`);
      }
    }


    console.log('\n=== 6. Seeding Cities (Kota/Provinsi) ===');
    // Buat tabel jika belum ada (opsional jika sudah via DDL, tapi aman)
    await db.query(`
      CREATE TABLE IF NOT EXISTS cities (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        name varchar(255) NOT NULL,
        province varchar(255) NOT NULL,
        created_at timestamp NULL DEFAULT NULL,
        updated_at timestamp NULL DEFAULT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const citiesData = [
      { name: 'Jakarta', province: 'DKI Jakarta' },
      { name: 'Surabaya', province: 'Jawa Timur' },
      { name: 'Bandung', province: 'Jawa Barat' },
      { name: 'Medan', province: 'Sumatera Utara' },
      { name: 'Semarang', province: 'Jawa Tengah' },
      { name: 'Makassar', province: 'Sulawesi Selatan' },
      { name: 'Palembang', province: 'Sumatera Selatan' },
      { name: 'Yogyakarta', province: 'Daerah Istimewa Yogyakarta' },
      { name: 'Balikpapan', province: 'Kalimantan Timur' },
      { name: 'Denpasar', province: 'Bali' },
      { name: 'Manado', province: 'Sulawesi Utara' },
      { name: 'Pekanbaru', province: 'Riau' },
      { name: 'Banjarmasin', province: 'Kalimantan Selatan' },
      { name: 'Pontianak', province: 'Kalimantan Barat' },
      { name: 'Padang', province: 'Sumatera Barat' },
      { name: 'Mataram', province: 'Nusa Tenggara Barat' },
      { name: 'Kupang', province: 'Nusa Tenggara Timur' },
      { name: 'Ambon', province: 'Maluku' },
      { name: 'Jayapura', province: 'Papua' }
    ];

    let countCities = 0;
    for (const city of citiesData) {
      const [existing] = await db.query('SELECT id FROM cities WHERE name = ?', [city.name]);
      if (existing.length === 0) {
        await db.query(
          'INSERT INTO cities (name, province, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
          [city.name, city.province]
        );
        console.log(`✓ Ditambahkan: ${city.name} (${city.province})`);
        countCities++;
      } else {
        console.log(`→ Sudah ada: ${city.name}`);
      }
    }

    console.log('\n=== Semua Seeding Selesai ===');
    process.exit(0);

  } catch (err) {
    console.error('Error saat seeding:', err);
    process.exit(1);
  }
}

seedMasterData();