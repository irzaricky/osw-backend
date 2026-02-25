/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // Clear data
    await queryInterface.bulkDelete('ref_master_calendars', null, {});
    
    // Drop primary key constraint
    try {
      await queryInterface.removeConstraint('ref_master_calendars', 'ref_master_calendars_pkey');
    } catch (e) {
      console.log('Failed to remove ref_master_calendars_pkey, it might have a different name.', e.message);
    }
    
    // Remove columns
    await queryInterface.removeColumn('ref_master_calendars', 'year');
    await queryInterface.removeColumn('ref_master_calendars', 'month');
    await queryInterface.removeColumn('ref_master_calendars', 'day');
    await queryInterface.removeColumn('ref_master_calendars', 'is_holiday');
    await queryInterface.removeColumn('ref_master_calendars', 'is_weekend');
    
    // Add id
    await queryInterface.addColumn('ref_master_calendars', 'id', {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: Sequelize.INTEGER
    });

    // Make date unique
    await queryInterface.addConstraint('ref_master_calendars', {
      fields: ['date'],
      type: 'unique',
      name: 'ref_master_calendars_date_uk'
    });

    // Add ref_type_calendar_id
    await queryInterface.addColumn('ref_master_calendars', 'ref_type_calendar_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'ref_type_calendars',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
  },
  
  async down(queryInterface, Sequelize) {
    // Revert changes
    await queryInterface.bulkDelete('ref_master_calendars', null, {});
    
    await queryInterface.removeColumn('ref_master_calendars', 'ref_type_calendar_id');
    await queryInterface.removeColumn('ref_master_calendars', 'id');
    
    try {
      await queryInterface.removeConstraint('ref_master_calendars', 'ref_master_calendars_date_uk');
    } catch(e) {
      console.log('Failed to remove ref_master_calendars_date_uk', e.message);
    }
    
    await queryInterface.addConstraint('ref_master_calendars', {
      fields: ['date'],
      type: 'primary key',
      name: 'ref_master_calendars_pkey'
    });

    await queryInterface.addColumn('ref_master_calendars', 'year', {
      allowNull: false,
      type: Sequelize.INTEGER,
      defaultValue: 2026
    });
    await queryInterface.addColumn('ref_master_calendars', 'month', {
     allowNull: false,
     type: Sequelize.INTEGER,
     defaultValue: 1
    });
    await queryInterface.addColumn('ref_master_calendars', 'day', {
      allowNull: false,
      type: Sequelize.INTEGER,
      defaultValue: 1
    });
    await queryInterface.addColumn('ref_master_calendars', 'is_holiday', {
      allowNull: false,
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
    await queryInterface.addColumn('ref_master_calendars', 'is_weekend', {
      allowNull: false,
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
  }
};
