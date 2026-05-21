export default {
  async up(queryInterface, Sequelize) {
    /**
     * =========================================================
     * 1. ROUTING TABLES
     * =========================================================
     */

    await queryInterface.createTable('s_part_routings', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      routing_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },

      part_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_parts',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },

      line_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 's_lines',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
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
      },

      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.createTable('s_part_routing_details', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      routing_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_part_routings',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },

      sequence: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      station_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_stations',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },

      job_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 's_jobs',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },

      standard_time: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      setup_time: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      queue_time: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      move_time: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      manpower_required: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      is_bottleneck: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      },
    });

    /**
     * =========================================================
     * 2. SNAPSHOT FIELDS - WORK ORDER STATION JOBS
     * =========================================================
     */

    await queryInterface.addColumn(
      's_work_order_station_jobs',
      'station_name_snapshot',
      {
        type: Sequelize.STRING(150),
        allowNull: true,
      }
    );

    await queryInterface.addColumn(
      's_work_order_station_jobs',
      'job_name_snapshot',
      {
        type: Sequelize.STRING(150),
        allowNull: true,
      }
    );

    await queryInterface.addColumn(
      's_work_order_station_jobs',
      'standard_time_snapshot',
      {
        type: Sequelize.INTEGER,
        allowNull: true,
      }
    );

    await queryInterface.addColumn(
      's_work_order_station_jobs',
      'setup_time_snapshot',
      {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      }
    );

    /**
     * =========================================================
     * 3. SNAPSHOT FIELDS - WORK ORDERS
     * =========================================================
     */

    await queryInterface.addColumn('s_work_orders', 'part_number_snapshot', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    await queryInterface.addColumn('s_work_orders', 'part_name_snapshot', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    await queryInterface.addColumn('s_work_orders', 'line_name_snapshot', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    await queryInterface.addColumn('s_work_orders', 'shift_name_snapshot', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    /**
     * =========================================================
     * 4. SNAPSHOT FIELDS - PRODUCTION SCHEDULES
     * =========================================================
     */

    await queryInterface.addColumn(
      's_production_order_schedules',
      'line_name_snapshot',
      {
        type: Sequelize.STRING(100),
        allowNull: true,
      }
    );

    await queryInterface.addColumn(
      's_production_order_schedules',
      'shift_name_snapshot',
      {
        type: Sequelize.STRING(100),
        allowNull: true,
      }
    );

    await queryInterface.addConstraint('s_part_routing_details', {
      fields: ['routing_id', 'sequence'],
      type: 'unique',
      name: 'uniq_part_routing_sequence'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('s_part_routing_details', 'uniq_part_routing_sequence');
    /**
     * =========================================================
     * REMOVE SNAPSHOT FIELDS - PRODUCTION SCHEDULES
     * =========================================================
     */

    await queryInterface.removeColumn(
      's_production_order_schedules',
      'shift_name_snapshot'
    );

    await queryInterface.removeColumn(
      's_production_order_schedules',
      'line_name_snapshot'
    );

    /**
     * =========================================================
     * REMOVE SNAPSHOT FIELDS - WORK ORDERS
     * =========================================================
     */

    await queryInterface.removeColumn(
      's_work_orders',
      'shift_name_snapshot'
    );

    await queryInterface.removeColumn(
      's_work_orders',
      'line_name_snapshot'
    );

    await queryInterface.removeColumn(
      's_work_orders',
      'part_name_snapshot'
    );

    await queryInterface.removeColumn(
      's_work_orders',
      'part_number_snapshot'
    );

    /**
     * =========================================================
     * REMOVE SNAPSHOT FIELDS - WO STATION JOBS
     * =========================================================
     */

    await queryInterface.removeColumn(
      's_work_order_station_jobs',
      'setup_time_snapshot'
    );

    await queryInterface.removeColumn(
      's_work_order_station_jobs',
      'standard_time_snapshot'
    );

    await queryInterface.removeColumn(
      's_work_order_station_jobs',
      'job_name_snapshot'
    );

    await queryInterface.removeColumn(
      's_work_order_station_jobs',
      'station_name_snapshot'
    );

    /**
     * =========================================================
     * DROP ROUTING TABLES
     * =========================================================
     */

    await queryInterface.dropTable('s_part_routing_details');
    await queryInterface.dropTable('s_part_routings');
  },
};