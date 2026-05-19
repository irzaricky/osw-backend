/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // 1. t_material_receiving_item_label updates
    await queryInterface.addColumn('t_material_receiving_item_label', 'quantity_checked_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('t_material_receiving_item_label', 'quantity_checked_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('t_material_receiving_item_label', 'quality_checked_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('t_material_receiving_item_label', 'quality_checked_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // 2. t_warehouse_stock_log updates
    // Change wh_stock_id to allow NULL
    await queryInterface.changeColumn('t_warehouse_stock_log', 'wh_stock_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    // Change Foreign Key constraint on wh_stock_id to onDelete: 'SET NULL'
    try {
      await queryInterface.removeConstraint('t_warehouse_stock_log', 't_warehouse_stock_log_wh_stock_id_fkey');
    } catch (err) {
      console.warn("Could not remove constraint 't_warehouse_stock_log_wh_stock_id_fkey', ignoring:", err.message);
    }
    await queryInterface.addConstraint('t_warehouse_stock_log', {
      fields: ['wh_stock_id'],
      type: 'foreign key',
      name: 't_warehouse_stock_log_wh_stock_id_fkey',
      references: {
        table: 't_warehouse_stock',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add additional columns to t_warehouse_stock_log
    await queryInterface.addColumn('t_warehouse_stock_log', 'selected_label', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
    await queryInterface.addColumn('t_warehouse_stock_log', 'fifo_override', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false
    });
    await queryInterface.addColumn('t_warehouse_stock_log', 'recommended_label', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
    await queryInterface.addColumn('t_warehouse_stock_log', 'wo_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('t_warehouse_stock_log', 'wo_item_label_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('t_warehouse_stock_log', 'label_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('t_warehouse_stock_log', 'part_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('t_warehouse_stock_log', 'bin_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('t_warehouse_stock_log', 'recommended_label_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn('t_warehouse_stock_log', 'recommended_label_number', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    // 2. t_warehouse_stock_log down
    await queryInterface.removeColumn('t_warehouse_stock_log', 'recommended_label_number');
    await queryInterface.removeColumn('t_warehouse_stock_log', 'recommended_label_id');
    await queryInterface.removeColumn('t_warehouse_stock_log', 'bin_id');
    await queryInterface.removeColumn('t_warehouse_stock_log', 'part_id');
    await queryInterface.removeColumn('t_warehouse_stock_log', 'label_id');
    await queryInterface.removeColumn('t_warehouse_stock_log', 'wo_item_label_id');
    await queryInterface.removeColumn('t_warehouse_stock_log', 'wo_id');
    await queryInterface.removeColumn('t_warehouse_stock_log', 'recommended_label');
    await queryInterface.removeColumn('t_warehouse_stock_log', 'fifo_override');
    await queryInterface.removeColumn('t_warehouse_stock_log', 'selected_label');

    try {
      await queryInterface.removeConstraint('t_warehouse_stock_log', 't_warehouse_stock_log_wh_stock_id_fkey');
    } catch (err) {
      console.warn("Could not remove constraint 't_warehouse_stock_log_wh_stock_id_fkey', ignoring:", err.message);
    }
    await queryInterface.addConstraint('t_warehouse_stock_log', {
      fields: ['wh_stock_id'],
      type: 'foreign key',
      name: 't_warehouse_stock_log_wh_stock_id_fkey',
      references: {
        table: 't_warehouse_stock',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    await queryInterface.changeColumn('t_warehouse_stock_log', 'wh_stock_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    });

    // 1. t_material_receiving_item_label down
    await queryInterface.removeColumn('t_material_receiving_item_label', 'quality_checked_by');
    await queryInterface.removeColumn('t_material_receiving_item_label', 'quality_checked_at');
    await queryInterface.removeColumn('t_material_receiving_item_label', 'quantity_checked_by');
    await queryInterface.removeColumn('t_material_receiving_item_label', 'quantity_checked_at');
  }
};
