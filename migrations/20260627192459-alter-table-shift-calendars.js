'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    console.log('[MIGRATION] Altering s_shift_calendars to allow NULL shift_id and ref_type_calendar_id...');
    
    const sequelize = queryInterface.sequelize;
    
    // ── Drop existing foreign keys (only shift_id and ref_type_calendar_id) ──
    console.log('  Dropping existing foreign keys...');
    await sequelize.query(
      `ALTER TABLE s_shift_calendars DROP CONSTRAINT IF EXISTS s_shift_calendars_shift_id_fkey CASCADE;`
    );
    await sequelize.query(
      `ALTER TABLE s_shift_calendars DROP CONSTRAINT IF EXISTS "s_shift_calendars_shift_id_fkey1" CASCADE;`
    );
    await sequelize.query(
      `ALTER TABLE s_shift_calendars DROP CONSTRAINT IF EXISTS s_shift_calendars_ref_type_calendar_id_fkey CASCADE;`
    );

    // ── Make columns nullable ───────────────────────────────────────────────
    console.log('  Making columns nullable...');
    await queryInterface.changeColumn('s_shift_calendars', 'shift_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.changeColumn('s_shift_calendars', 'ref_type_calendar_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // ── Re-add foreign keys with correct ON DELETE behavior ─────────────────
    console.log('  Re-adding foreign keys...');
    
    await sequelize.query(
      `ALTER TABLE s_shift_calendars 
       ADD CONSTRAINT s_shift_calendars_shift_id_fkey 
       FOREIGN KEY (shift_id) REFERENCES s_shifts(id) 
       ON UPDATE CASCADE ON DELETE SET NULL;`
    );

    await sequelize.query(
      `ALTER TABLE s_shift_calendars 
       ADD CONSTRAINT s_shift_calendars_ref_type_calendar_id_fkey 
       FOREIGN KEY (ref_type_calendar_id) REFERENCES ref_type_calendars(id) 
       ON UPDATE CASCADE ON DELETE RESTRICT;`
    );

    console.log('✅ Column shift_id and ref_type_calendar_id are now nullable.');
  },

  async down(queryInterface, Sequelize) {
    console.log('[MIGRATION] Reverting s_shift_calendars...');
    
    const sequelize = queryInterface.sequelize;

    // ── Drop foreign keys ───────────────────────────────────────────────────
    await sequelize.query(
      `ALTER TABLE s_shift_calendars DROP CONSTRAINT IF EXISTS s_shift_calendars_shift_id_fkey CASCADE;`
    );
    await sequelize.query(
      `ALTER TABLE s_shift_calendars DROP CONSTRAINT IF EXISTS s_shift_calendars_ref_type_calendar_id_fkey CASCADE;`
    );

    // ── Make columns NOT NULL again ─────────────────────────────────────────
    await queryInterface.changeColumn('s_shift_calendars', 'shift_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });

    await queryInterface.changeColumn('s_shift_calendars', 'ref_type_calendar_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });

    // ── Re-add original foreign keys ────────────────────────────────────────
    await sequelize.query(
      `ALTER TABLE s_shift_calendars 
       ADD CONSTRAINT s_shift_calendars_shift_id_fkey 
       FOREIGN KEY (shift_id) REFERENCES s_shifts(id) 
       ON UPDATE CASCADE ON DELETE RESTRICT;`
    );

    await sequelize.query(
      `ALTER TABLE s_shift_calendars 
       ADD CONSTRAINT s_shift_calendars_ref_type_calendar_id_fkey 
       FOREIGN KEY (ref_type_calendar_id) REFERENCES ref_type_calendars(id) 
       ON UPDATE CASCADE ON DELETE RESTRICT;`
    );

    console.log('✅ Reverted shift_id and ref_type_calendar_id to NOT NULL.');
  },
};