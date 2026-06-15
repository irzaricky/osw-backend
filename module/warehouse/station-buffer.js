import db from '../../models/index.js';
import { QueryTypes } from 'sequelize';

class StationBuffer {
  async list(req) {
    try {
      const rows = await db.sequelize.query(`
        SELECT
          bs.id AS buffer_stock_id,
          bs.station_id,
          st.name AS station_name,

          bs.part_id,
          part.part_number,
          part.part_name,
          part.part_category,
          part.standard_buffer_stock,

          COALESCE(pkg.capacity, 1)::int AS capacity_per_kanban,

          bs.qty_kanban,
          bs.qty_pcs,
          bs.oldest_supply_at,
          bs.latest_supply_at,

          EXTRACT(DAY FROM NOW() - bs.oldest_supply_at)::int AS aging_days,

          CASE
            WHEN bs.qty_kanban < COALESCE(part.standard_buffer_stock, 0)
            THEN true
            ELSE false
          END AS need_replenishment,

          GREATEST(
            COALESCE(part.standard_buffer_stock, 0) - bs.qty_kanban,
            0
          )::int AS shortage_kanban

        FROM t_station_buffer_stock bs
        JOIN s_parts part ON part.id = bs.part_id
        LEFT JOIN s_packages pkg ON pkg.id = part.package_id
        JOIN s_stations st ON st.id = bs.station_id
        WHERE bs.deleted_at IS NULL
        ORDER BY need_replenishment DESC, aging_days DESC NULLS LAST
      `, {
        type: QueryTypes.SELECT
      });

      return {
        status: true,
        data: rows
      };
    } catch (error) {
      return {
        status: false,
        error: error.message,
        code: 500
      };
    }
  }
async addManual(req) {
  const t = await db.sequelize.transaction();

  try {
    const {
      station_id,
      part_id,
      qty_kanban,
      qty_pcs,
      remarks
    } = req.body;

    const now = new Date();

    const [bufferStock] = await db.TStationBufferStock.findOrCreate({
      where: {
        station_id,
        part_id
      },
      defaults: {
        station_id,
        part_id,
        qty_kanban: 0,
        qty_pcs: 0,
        oldest_supply_at: now,
        latest_supply_at: now
      },
      transaction: t
    });

    await bufferStock.update({
      qty_kanban: Number(bufferStock.qty_kanban || 0) + Number(qty_kanban || 0),
      qty_pcs: Number(bufferStock.qty_pcs || 0) + Number(qty_pcs || 0),
      oldest_supply_at: bufferStock.oldest_supply_at || now,
      latest_supply_at: now
    }, {
      transaction: t
    });

    await db.TStationBufferStockLog.create({
      buffer_stock_id: bufferStock.id,
      transaction_type: 'IN',
      qty_kanban: Number(qty_kanban || 0),
      qty_pcs: Number(qty_pcs || 0),
      reference_type: 'MANUAL',
      reference_id: null,
      remarks: remarks || null,
      created_by: req.user?.id || null
    }, {
      transaction: t
    });

    await t.commit();

    return {
      status: true,
      message: 'Station buffer stock added successfully',
      data: bufferStock
    };
  } catch (error) {
    if (t && !t.finished) await t.rollback();

    return {
      status: false,
      error: error.message,
      code: 500
    };
  }
}
async useBuffer(req) {
  const t = await db.sequelize.transaction();

  try {
    const {
      station_id,
      part_id,
      qty_kanban,
      qty_pcs,
      remarks
    } = req.body;

    const bufferStock = await db.TStationBufferStock.findOne({
      where: { station_id, part_id },
      transaction: t
    });

    if (!bufferStock) {
      await t.rollback();
      return {
        status: false,
        message: 'Buffer stock not found',
        code: 404
      };
    }

    if (Number(bufferStock.qty_kanban || 0) < Number(qty_kanban || 0)) {
      await t.rollback();
      return {
        status: false,
        message: 'Insufficient buffer stock',
        code: 400
      };
    }

    await bufferStock.update({
      qty_kanban: Number(bufferStock.qty_kanban || 0) - Number(qty_kanban || 0),
      qty_pcs: Number(bufferStock.qty_pcs || 0) - Number(qty_pcs || 0)
    }, {
      transaction: t
    });

    await db.TStationBufferStockLog.create({
      buffer_stock_id: bufferStock.id,
      transaction_type: 'OUT',
      qty_kanban: Number(qty_kanban || 0),
      qty_pcs: Number(qty_pcs || 0),
      reference_type: 'PRODUCTION_USAGE',
      reference_id: null,
      remarks: remarks || null,
      created_by: req.user?.id || null
    }, {
      transaction: t
    });

    await t.commit();

    return {
      status: true,
      message: 'Buffer stock used successfully',
      data: bufferStock
    };
  } catch (error) {
    if (t && !t.finished) await t.rollback();

    return {
      status: false,
      error: error.message,
      code: 500
    };
  }
}
async scrapBuffer(req) {
  const t = await db.sequelize.transaction();

  try {
    const {
      station_id,
      part_id,
      qty_kanban,
      qty_pcs,
      remarks
    } = req.body;

    const bufferStock = await db.TStationBufferStock.findOne({
      where: { station_id, part_id },
      transaction: t
    });

    if (!bufferStock) {
      await t.rollback();
      return {
        status: false,
        message: 'Buffer stock not found',
        code: 404
      };
    }

    if (Number(bufferStock.qty_kanban || 0) < Number(qty_kanban || 0)) {
      await t.rollback();
      return {
        status: false,
        message: 'Insufficient buffer stock',
        code: 400
      };
    }

    await bufferStock.update({
      qty_kanban: Number(bufferStock.qty_kanban || 0) - Number(qty_kanban || 0),
      qty_pcs: Number(bufferStock.qty_pcs || 0) - Number(qty_pcs || 0)
    }, {
      transaction: t
    });

    await db.TStationBufferStockLog.create({
      buffer_stock_id: bufferStock.id,
      transaction_type: 'SCRAP',
      qty_kanban: Number(qty_kanban || 0),
      qty_pcs: Number(qty_pcs || 0),
      reference_type: 'SCRAP',
      reference_id: null,
      remarks: remarks || null,
      created_by: req.user?.id || null
    }, {
      transaction: t
    });

    await t.commit();

    return {
      status: true,
      message: 'Buffer stock scrapped successfully',
      data: bufferStock
    };
  } catch (error) {
    if (t && !t.finished) await t.rollback();

    return {
      status: false,
      error: error.message,
      code: 500
    };
  }
}
async logs(req) {
  try {
    const {
      station_id,
      part_id,
      transaction_type
    } = req.query;

    const where = [];

    if (station_id) {
      where.push(`bs.station_id = :station_id`);
    }

    if (part_id) {
      where.push(`bs.part_id = :part_id`);
    }

    if (transaction_type) {
      where.push(`log.transaction_type = :transaction_type`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await db.sequelize.query(`
      SELECT
        log.id AS log_id,
        log.transaction_type,
        log.qty_kanban,
        log.qty_pcs,
        log.reference_type,
        log.reference_id,
        log.remarks,
        log.created_at,

        bs.station_id,
        st.name AS station_name,

        bs.part_id,
        part.part_number,
        part.part_name,
        part.part_category,

        usr.email AS created_by_email

      FROM t_station_buffer_stock_log log
      JOIN t_station_buffer_stock bs
        ON bs.id = log.buffer_stock_id
      JOIN s_stations st
        ON st.id = bs.station_id
      JOIN s_parts part
        ON part.id = bs.part_id
      LEFT JOIN s_users usr
        ON usr.id = log.created_by

      ${whereClause}

      ORDER BY log.created_at DESC
    `, {
      replacements: {
        station_id,
        part_id,
        transaction_type
      },
      type: QueryTypes.SELECT
    });

    return {
      status: true,
      data: rows
    };
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    };
  }
}
async summary(req) {
  try {
    const rows = await db.sequelize.query(`
      SELECT
        COUNT(bs.id)::int AS total_buffer_items,

        COUNT(bs.id) FILTER (
          WHERE bs.qty_kanban < COALESCE(part.standard_buffer_stock, 0)
        )::int AS need_replenishment_items,

        COUNT(bs.id) FILTER (
          WHERE bs.qty_kanban >= COALESCE(part.standard_buffer_stock, 0)
        )::int AS safe_buffer_items,

        COALESCE(SUM(bs.qty_kanban), 0)::int AS total_buffer_kanban,
        COALESCE(SUM(bs.qty_pcs), 0)::int AS total_buffer_pcs,

        COUNT(bs.id) FILTER (
          WHERE bs.oldest_supply_at <= NOW() - INTERVAL '7 days'
        )::int AS aging_7_days,

        COUNT(bs.id) FILTER (
          WHERE bs.oldest_supply_at <= NOW() - INTERVAL '30 days'
        )::int AS aging_30_days

      FROM t_station_buffer_stock bs
      JOIN s_parts part
        ON part.id = bs.part_id
      WHERE bs.deleted_at IS NULL
    `, {
      type: QueryTypes.SELECT
    });

    const scrapRows = await db.sequelize.query(`
      SELECT
        COALESCE(SUM(qty_kanban), 0)::int AS total_scrap_kanban,
        COALESCE(SUM(qty_pcs), 0)::int AS total_scrap_pcs
      FROM t_station_buffer_stock_log
      WHERE deleted_at IS NULL
        AND transaction_type = 'SCRAP'
    `, {
      type: QueryTypes.SELECT
    });

    return {
      status: true,
      data: {
        ...(rows[0] || {}),
        ...(scrapRows[0] || {})
      }
    };
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    };
  }
}
async partDropdown(req) {
  try {
    const rows = await db.sequelize.query(`
      SELECT
        id,
        part_number,
        part_name,
        standard_buffer_stock
      FROM s_parts
      WHERE deleted_at IS NULL
      ORDER BY part_number ASC
    `, {
      type: QueryTypes.SELECT
    });

    return {
      status: true,
      data: rows
    };
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    };
  }
}
}

export default new StationBuffer();