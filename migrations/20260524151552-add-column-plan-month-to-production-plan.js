export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("s_production_plans", "plan_month", {
      type: Sequelize.STRING(7),
      allowNull: false,
      comment: "Format YYYY-MM, representing the month of the production plan. One month for only one production plan.",
    });
    
    // plan type
    await queryInterface.addColumn("s_production_plans", "plan_type", {
      type: Sequelize.ENUM("ORIGINAL", "AMENDMENT"),
      allowNull: false,
      defaultValue: "ORIGINAL",
      comment: "Type of production plan, either ORIGINAL or AMENDMENT. Amendment plan is used to revise the original plan for the same month.",
    });

    // parent plan id, used to link amendment plan to original plan
    await queryInterface.addColumn("s_production_plans", "parent_plan_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "s_production_plans",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      comment: "Reference to the original production plan when this is an amendment. Null for original plans.",
    });

    await queryInterface.addIndex("s_production_plans", ["plan_month"], {
      name: "idx_s_production_plans_plan_month",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("s_production_plans", "parent_plan_id");
    await queryInterface.removeColumn("s_production_plans", "plan_type");
    await queryInterface.removeIndex(
      "s_production_plans",
      "idx_s_production_plans_plan_month"
    );
    await queryInterface.removeColumn("s_production_plans", "plan_month");
  },
};
