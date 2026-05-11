/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // 1. Create Logs Table
    await queryInterface.createTable('s_sales_purchase_request_logs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      spr_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_sales_purchase_requests',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      status: {
        allowNull: false,
        type: Sequelize.STRING(50)
      },
      action: {
        allowNull: false,
        type: Sequelize.STRING(50)
      },
      remarks: {
        type: Sequelize.TEXT
      },
      changed_by: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // 2. Update SPR Table
    await queryInterface.addColumn('s_sales_purchase_requests', 'sales_order_approved_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('s_sales_purchase_requests', 'ppic_approved_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 's_users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.changeColumn('s_sales_purchase_requests', 'status', {
      allowNull: false,
      defaultValue: 'Draft',
      type: Sequelize.STRING(50),
      comment: 'Draft, Waiting Supervisor Sales Order, Waiting Supervisor PPIC, Approved, Rejected'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('s_sales_purchase_request_logs');
    await queryInterface.removeColumn('s_sales_purchase_requests', 'sales_order_approved_by');
    await queryInterface.removeColumn('s_sales_purchase_requests', 'ppic_approved_by');
    await queryInterface.changeColumn('s_sales_purchase_requests', 'status', {
      allowNull: false,
      defaultValue: 'Draft',
      type: Sequelize.STRING(50),
      comment: 'Draft, Waiting PPIC, Approved, Rejected'
    });
  }
};
