'use strict';

export default {
  async up(queryInterface, Sequelize) {
    // In Postgres, alter column to JSON with USING to convert existing strings into a JSON array
    await queryInterface.sequelize.query(`
      ALTER TABLE s_delivery_orders 
      ALTER COLUMN proof_of_delivery TYPE JSON 
      USING CASE 
        WHEN proof_of_delivery IS NULL THEN NULL 
        WHEN proof_of_delivery LIKE '[%' THEN proof_of_delivery::json
        ELSE json_build_array(proof_of_delivery) 
      END
    `);
  },

  async down(queryInterface, Sequelize) {
    // Convert back to STRING(255). We grab the first element if it's a JSON array, or just convert to text
    await queryInterface.sequelize.query(`
      ALTER TABLE s_delivery_orders 
      ALTER COLUMN proof_of_delivery TYPE VARCHAR(255) 
      USING CASE 
        WHEN proof_of_delivery IS NULL THEN NULL 
        ELSE (proof_of_delivery::json->>0)
      END
    `);
  }
};
