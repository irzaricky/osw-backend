'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     * s_production_plan_calendar_adjustments
─────────────────────────────────────
id
plan_id              FK → s_production_plans
date                 tanggal yang disesuaikan
adjustment_type      ENUM: ADD_WORKING_DAY, ADD_SHIFT, ADD_OVERTIME
shift_id             nullable, wajib kalau ADD_SHIFT
overtime_minutes     nullable, wajib kalau ADD_OVERTIME
reason               text
inherited_from_plan  nullable, diisi plan_id parent kalau dari amendment
     */
    await queryInterface.createTable('s_production_plan_calendar_adjustments', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      plan_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_production_plans',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      adjustment_type: {
        type: Sequelize.ENUM('ADD_WORKING_DAY', 'ADD_SHIFT', 'ADD_OVERTIME'),
        allowNull: false,
      },
      shift_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 's_shifts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      overtime_minutes: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      reason: {
        type: Sequelize.TEXT,
      },
      inherited_from_plan: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 's_production_plans',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      }
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.dropTable('s_production_plan_calendar_adjustments');
  }
};
