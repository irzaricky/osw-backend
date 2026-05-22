'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface) {
    // ============================================================
    // Normalisasi nomor MRP format lama → format baru
    //
    // Format lama: MRP-YYYYMMDD-XXXX  (e.g. MRP-20260601-0003)
    // Format baru: MRP-YYYY-MM-XXX    (e.g. MRP-2026-06-003)
    //
    // Hanya menyentuh rows yang cocok pola '^MRP-[0-9]{8}-[0-9]+$'
    // Rows soft-deleted (deleted_at IS NOT NULL) ikut diupdate agar
    // generateMrpNumber bisa baca sequence-nya dengan benar.
    //
    // Perbedaan vs MySQL:
    //   - REGEXP      → ~ (PostgreSQL regex operator)
    //   - SUBSTRING(str, pos, len) → SUBSTR(str, pos, len)  [sama]
    //   - SUBSTRING_INDEX          → SPLIT_PART
    //   - LPAD                     → LPAD  [sama]
    //   - CAST(x AS UNSIGNED)      → CAST(x AS INTEGER)
    //   - CONCAT(...)              → CONCAT(...)  [sama]
    // ============================================================
    await queryInterface.sequelize.query(`
      UPDATE s_mrps
      SET number = CONCAT(
        'MRP-',
        SUBSTR(number, 5, 4),
        '-',
        SUBSTR(number, 9, 2),
        '-',
        LPAD(
          CAST(SPLIT_PART(number, '-', -1) AS INTEGER)::TEXT,
          3, '0'
        )
      )
      WHERE number ~ '^MRP-[0-9]{8}-[0-9]+$';
    `);
  },

  async down(queryInterface) {
    // ============================================================
    // Rollback: kembalikan format baru → format lama
    //
    // Format baru: MRP-YYYY-MM-XXX    (e.g. MRP-2026-06-003)
    // Format lama: MRP-YYYYMMDD-XXXX  (e.g. MRP-20260601-0003)
    //
    // Catatan: tanggal (DD) tidak bisa dikembalikan karena tidak
    // tersimpan di format baru — rollback menggunakan '01' sebagai
    // placeholder tanggal, dan sequence dikembalikan ke 4 digit.
    // ============================================================
    await queryInterface.sequelize.query(`
      UPDATE s_mrps
      SET number = CONCAT(
        'MRP-',
        REPLACE(SUBSTR(number, 5, 7), '-', ''),
        '01-',
        LPAD(
          CAST(SPLIT_PART(number, '-', -1) AS INTEGER)::TEXT,
          4, '0'
        )
      )
      WHERE number ~ '^MRP-[0-9]{4}-[0-9]{2}-[0-9]+$';
    `);
  },
};