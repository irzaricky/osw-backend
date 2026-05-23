'use strict';

export default {
  async up(queryInterface, Sequelize) {
    // 1. Insert unified role if not exists
    const existingRoles = await queryInterface.sequelize.query(
      `SELECT id FROM s_roles WHERE name = 'Supervisor Sales'`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    let newRoleId;
    if (existingRoles.length === 0) {
      await queryInterface.bulkInsert('s_roles', [
        {
          name: 'Supervisor Sales',
          division_id: 1,
          status: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);

      const newRoles = await queryInterface.sequelize.query(
        `SELECT id FROM s_roles WHERE name = 'Supervisor Sales'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      newRoleId = newRoles[0].id;
    } else {
      newRoleId = existingRoles[0].id;
    }

    // 2. Find old roles' IDs
    const oldRoles = await queryInterface.sequelize.query(
      `SELECT id FROM s_roles WHERE name IN ('Supervisor Sales Forecast', 'Supervisor Sales Order', 'Supervisor Sales Delivery')`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const oldRoleIds = oldRoles.map(r => r.id);

    if (oldRoleIds.length > 0) {
      const oldRoleIdsStr = oldRoleIds.join(',');

      // 3. Reassign users assigned to old roles to the new Supervisor Sales role
      await queryInterface.sequelize.query(
        `UPDATE s_users SET role_id = ${newRoleId}, updated_at = CURRENT_TIMESTAMP WHERE role_id IN (${oldRoleIdsStr})`
      );

      // 4. Soft-deactivate the old roles (status = false)
      await queryInterface.sequelize.query(
        `UPDATE s_roles SET status = false, updated_at = CURRENT_TIMESTAMP WHERE id IN (${oldRoleIdsStr})`
      );
    }
  },

  async down(queryInterface, Sequelize) {
    // 1. Find new role ID
    const newRoles = await queryInterface.sequelize.query(
      `SELECT id FROM s_roles WHERE name = 'Supervisor Sales'`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (newRoles.length > 0) {
      const newRoleId = newRoles[0].id;

      // 2. Re-activate the three old roles
      await queryInterface.sequelize.query(
        `UPDATE s_roles SET status = true, updated_at = CURRENT_TIMESTAMP WHERE name IN ('Supervisor Sales Forecast', 'Supervisor Sales Order', 'Supervisor Sales Delivery')`
      );

      const forecastRoles = await queryInterface.sequelize.query(
        `SELECT id FROM s_roles WHERE name = 'Supervisor Sales Forecast'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );

      if (forecastRoles.length > 0) {
        const forecastRoleId = forecastRoles[0].id;
        // 3. Reassign users back to Supervisor Sales Forecast as a default fallback
        await queryInterface.sequelize.query(
          `UPDATE s_users SET role_id = ${forecastRoleId}, updated_at = CURRENT_TIMESTAMP WHERE role_id = ${newRoleId}`
        );
      }

      // 4. Delete the new Supervisor Sales role
      await queryInterface.sequelize.query(
        `DELETE FROM s_roles WHERE id = ${newRoleId}`
      );
    }
  }
};
