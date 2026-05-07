/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_delivery_plan_details', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      delivery_plan_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_delivery_plans',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      spo_detail_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 's_sales_purchase_order_details',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'Referensi ke detail item SPO / Sales Order yang akan dikirim'
      },
      planned_qty: {
        allowNull: false,
        defaultValue: 0,
        type: Sequelize.INTEGER
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
      },
      deleted_at: {
        type: Sequelize.DATE
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('s_delivery_plan_details');
  }
};
