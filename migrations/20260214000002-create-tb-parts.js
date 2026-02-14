/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('s_parts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      part_number: {
        allowNull: false,
        type: Sequelize.STRING(100),
        unique: true
      },
      part_name: {
        allowNull: false,
        type: Sequelize.STRING(255)
      },
      part_type_code: {
        allowNull: true,
        type: Sequelize.STRING(50),
        references: {
           model: 'ref_part_types',
           key: 'code'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      part_category: {
        allowNull: true,
        type: Sequelize.STRING(50),
        comment: 'Big Part, Small Part, etc.'
      },
      supplier_id: {
        allowNull: true,
        type: Sequelize.INTEGER,
        references: {
           model: 's_suppliers',
           key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      price: {
        allowNull: true,
        type: Sequelize.DECIMAL(15, 2)
      },
      safety_stock: {
        allowNull: true,
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      lead_time_days: {
        allowNull: true,
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      // Product specific fields (nullable)
      model_name: {
        allowNull: true,
        type: Sequelize.STRING(50)
      },
      model_code: {
        allowNull: true,
        type: Sequelize.STRING(50)
      },
      generation: {
        allowNull: true,
        type: Sequelize.STRING(20)
      },
      color: {
        allowNull: true,
        type: Sequelize.STRING(50)
      },
      color_code: {
        allowNull: true,
        type: Sequelize.STRING(20)
      },
      uom: {
        allowNull: true,
        type: Sequelize.STRING(20)
      },
      // Common fields
      package_name: {
        allowNull: true,
        type: Sequelize.STRING(100)
      },
      package_code: {
        allowNull: true,
        type: Sequelize.STRING(50)
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
        allowNull: true,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('s_parts');
  }
};
