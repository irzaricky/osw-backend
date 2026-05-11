// Seed data untuk ref_bom_document_statuses dan ref_bom_activation_statuses
// Jalankan setelah migration 03 dan 05

export default {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert('ref_bom_document_statuses', [
      {
        code: 'DRAFT',
        name: 'Draft',
        sequence: 1,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        code: 'PENDING_APPROVAL',
        name: 'Pending Approval',
        sequence: 2,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        code: 'APPROVED',
        name: 'Approved',
        sequence: 3,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        code: 'REJECTED',
        name: 'Rejected',
        sequence: 4,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    ]);

    await queryInterface.bulkInsert('ref_bom_activation_statuses', [
      {
        code: 'INACTIVE',
        name: 'Inactive',
        sequence: 1,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        code: 'ACTIVE',
        name: 'Active',
        sequence: 2,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('ref_bom_activation_statuses', null, {});
    await queryInterface.bulkDelete('ref_bom_document_statuses', null, {});
  },
};