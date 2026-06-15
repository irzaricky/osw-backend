import db from '../../models/index.js'
import { QueryTypes } from 'sequelize'

class ProductionMaterialControlModule {
  async listProductionResult(req) {
  try {
    const {
    page = 1,
    limit = 10,
    search,
    date_from,
    date_to,
    station_id,

    has_ng
  } = req.query

    const offset = (Number(page) - 1) * Number(limit)

    const where = ['pmr.deleted_at IS NULL']
    const replacements = {
      limit: Number(limit),
      offset
    }

    if (search) {
      where.push(`(
        product.part_number ILIKE :search OR
        product.part_name ILIKE :search OR
        material.part_number ILIKE :search OR
        material.part_name ILIKE :search OR
        st.name ILIKE :search
      )`)
      replacements.search = `%${search}%`
    }

    if (date_from) {
      where.push(`pmr.production_date >= :date_from`)
      replacements.date_from = date_from
    }

    if (date_to) {
      where.push(`pmr.production_date <= :date_to`)
      replacements.date_to = date_to
    }

    if (station_id) {
      where.push(`pmr.station_id = :station_id`)
      replacements.station_id = station_id
    }

    if (has_ng === 'true' || has_ng === true) {
  where.push(`pmr.total_ng > 0`)
}

    const whereClause = `WHERE ${where.join(' AND ')}`

    const rows = await db.sequelize.query(`
      SELECT
        pmr.id,
        pmr.production_date,
        pmr.shift_id,
        sh.name AS shift_name,
        pmr.station_id,
        st.name AS station_name,

        pmr.part_id,
        product.part_number AS product_part_number,
        product.part_name AS product_part_name,

        pmr.material_part_id,
        material.part_number AS material_part_number,
        material.part_name AS material_part_name,

        pmr.planning_qty,
        pmr.actual_qty,
        pmr.total_ok,
        pmr.total_ng,
        pmr.remarks,
        pmr.created_at

      FROM t_production_material_result pmr
      JOIN s_shifts sh ON sh.id = pmr.shift_id
      JOIN s_stations st ON st.id = pmr.station_id
      JOIN s_parts product ON product.id = pmr.part_id
      LEFT JOIN s_parts material ON material.id = pmr.material_part_id

      ${whereClause}

      ORDER BY pmr.production_date DESC, pmr.id DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    const countRows = await db.sequelize.query(`
      SELECT COUNT(*)::int AS total
      FROM t_production_material_result pmr
      JOIN s_stations st ON st.id = pmr.station_id
      JOIN s_parts product ON product.id = pmr.part_id
      LEFT JOIN s_parts material ON material.id = pmr.material_part_id
      ${whereClause}
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    const total = Number(countRows[0]?.total || 0)

    return {
      status: true,
      data: rows,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total
      }
    }
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    }
  }
}

  async createProductionResult(req) {
  const transaction = await db.sequelize.transaction()

  try {
    const data = req.body

    const totalNg = Number(data.total_ng || 0)
    const ngMaterials = Array.isArray(data.ng_materials)
      ? data.ng_materials
      : []

    const totalNgMaterial = ngMaterials.reduce((sum, item) => {
      return sum + Number(item.qty_ng || 0)
    }, 0)

    if (totalNg !== totalNgMaterial) {
      await transaction.rollback()

      return {
        status: false,
        message: `Total NG (${totalNg}) must be equal to NG material detail (${totalNgMaterial})`,
        code: 400
      }
    }

    const result = await db.TProductionMaterialResult.create({
      production_date: data.production_date,
      shift_id: data.shift_id,
      station_id: data.station_id,
      part_id: data.part_id,
      material_part_id: data.material_part_id || null,
      planning_qty: Number(data.planning_qty || 0),
      actual_qty: Number(data.actual_qty || 0),
      total_ok: Number(data.total_ok || 0),
      total_ng: totalNg,
      remarks: data.remarks || null,
      created_by: req.user?.id || null
    }, {
      transaction
    })

    for (const item of ngMaterials) {
      const qtyNg = Number(item.qty_ng || 0)

      if (qtyNg > 0) {
        await db.sequelize.query(`
          INSERT INTO t_production_material_result_ng_details
            (
              production_result_id,
              material_part_id,
              qty_ng,
              remarks,
              created_at,
              updated_at
            )
          VALUES
            (
              :production_result_id,
              :material_part_id,
              :qty_ng,
              :remarks,
              NOW(),
              NOW()
            )
        `, {
          replacements: {
            production_result_id: result.id,
            material_part_id: item.material_part_id,
            qty_ng: qtyNg,
            remarks: item.remarks || null
          },
          type: QueryTypes.INSERT,
          transaction
        })
      }
    }

    await transaction.commit()

    return {
      status: true,
      message: 'Production result created successfully',
      data: result
    }
  } catch (error) {
    await transaction.rollback()

    return {
      status: false,
      message: error.message,
      code: 500
    }
  }
}
  async listScrap(req) {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      date_from,
      date_to
    } = req.query

    const offset = (Number(page) - 1) * Number(limit)

    const where = ['scrap.deleted_at IS NULL']
    const replacements = {
      limit: Number(limit),
      offset
    }

    if (search) {
      where.push(`(
        product.part_number ILIKE :search OR
        product.part_name ILIKE :search OR
        material.part_number ILIKE :search OR
        material.part_name ILIKE :search OR
        scrap.remarks ILIKE :search
      )`)
      replacements.search = `%${search}%`
    }

   if (date_from) {
    where.push(`DATE(scrap.scrap_date) >= DATE(:date_from)`)
    replacements.date_from = date_from
  }

  if (date_to) {
    where.push(`DATE(scrap.scrap_date) <= DATE(:date_to)`)
    replacements.date_to = date_to
  }

    const whereClause = `WHERE ${where.join(' AND ')}`

    const rows = await db.sequelize.query(`
      SELECT
        scrap.id,
        scrap.scrap_date,
        scrap.production_result_id,

        scrap.part_id,
        product.part_number AS product_part_number,
        product.part_name AS product_part_name,

        scrap.material_part_id,
        material.part_number AS material_part_number,
        material.part_name AS material_part_name,

        scrap.qty_scrap,
        scrap.weight_per_pcs,
        scrap.total_weight,
        scrap.remarks,
        scrap.created_at

      FROM t_production_material_scrap scrap
      JOIN s_parts product ON product.id = scrap.part_id
      JOIN s_parts material ON material.id = scrap.material_part_id

      ${whereClause}

      ORDER BY scrap.scrap_date DESC, scrap.id DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    const countRows = await db.sequelize.query(`
      SELECT COUNT(*)::int AS total
      FROM t_production_material_scrap scrap
      JOIN s_parts product ON product.id = scrap.part_id
      JOIN s_parts material ON material.id = scrap.material_part_id
      ${whereClause}
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    return {
      status: true,
      data: rows,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total: Number(countRows[0]?.total || 0)
      }
    }
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    }
  }
}
async createScrap(req) {
  try {
    const data = req.body

    const [material] = await db.sequelize.query(`
      SELECT
        id,
        part_number,
        part_name,
        weight_per_pcs
      FROM s_parts
      WHERE id = :material_part_id
        AND deleted_at IS NULL
      LIMIT 1
    `, {
      replacements: {
        material_part_id: data.material_part_id
      },
      type: QueryTypes.SELECT
    })

    if (!material) {
      return {
        status: false,
        message: 'Material part not found',
        code: 404
      }
    }

    const qtyScrap = Number(data.qty_scrap || 0)
    const weightPerPcs = Number(material.weight_per_pcs || 0)

    if (qtyScrap <= 0) {
      return {
        status: false,
        message: 'Scrap quantity must be greater than 0',
        code: 400
      }
    }

    if (weightPerPcs <= 0) {
      return {
        status: false,
        message: 'Material weight per PCS has not been set',
        code: 400
      }
    }

    const totalWeight = qtyScrap * weightPerPcs

    const scrap = await db.TProductionMaterialScrap.create({
      production_result_id: data.production_result_id,
      scrap_date: data.scrap_date,
      part_id: data.part_id,
      material_part_id: data.material_part_id,
      qty_scrap: qtyScrap,
      weight_per_pcs: weightPerPcs,
      total_weight: totalWeight,
      remarks: data.remarks || null,
      created_by: req.user?.id || null
    })

    return {
      status: true,
      message: 'Scrap created successfully',
      data: scrap
    }
  } catch (error) {
    return {
      status: false,
      message: error.message,
      code: 500
    }
  }
}
async listReplacement(req) {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      station_id,
      date_from,
      date_to
    } = req.query

    const offset = (Number(page) - 1) * Number(limit)

    const where = ['r.deleted_at IS NULL']
    const replacements = {
      limit: Number(limit),
      offset
    }

    if (search) {
      where.push(`(
        p.part_number ILIKE :search OR
        p.part_name ILIKE :search OR
        st.name ILIKE :search OR
        r.replacement_reason ILIKE :search
      )`)
      replacements.search = `%${search}%`
    }

    if (station_id) {
      where.push(`r.station_id = :station_id`)
      replacements.station_id = station_id
    }

    if (date_from) {
      where.push(`DATE(r.created_at) >= :date_from`)
      replacements.date_from = date_from
    }

    if (date_to) {
      where.push(`DATE(r.created_at) <= :date_to`)
      replacements.date_to = date_to
    }

    const whereClause = `WHERE ${where.join(' AND ')}`

    const rows = await db.sequelize.query(`
      SELECT
        r.id,
        r.production_result_id,

        r.station_id,
        st.name AS station_name,

        r.material_part_id,
        p.part_number,
        p.part_name,

        r.qty_replacement,
        r.replacement_reason,
        r.source_label_number,
        r.source_label_id,
        r.source_wo_item_label_id,
        r.created_at

      FROM t_production_material_replacement r
      JOIN s_stations st ON st.id = r.station_id
      JOIN s_parts p ON p.id = r.material_part_id

      ${whereClause}

      ORDER BY r.id DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    const countRows = await db.sequelize.query(`
      SELECT COUNT(*)::int AS total
      FROM t_production_material_replacement r
      JOIN s_stations st ON st.id = r.station_id
      JOIN s_parts p ON p.id = r.material_part_id
      ${whereClause}
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    const total = Number(countRows[0]?.total || 0)

    return {
      status: true,
      data: rows,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total
      }
    }
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    }
  }
}
async createReplacement(req) {
  const transaction = await db.sequelize.transaction()

  try {
    const data = req.body
    const qtyReplacement = Number(data.qty_replacement || 0)

    if (qtyReplacement <= 0) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Replacement quantity must be greater than 0',
        code: 400
      }
    }

    const bufferStock = await db.TStationBufferStock.findOne({
      where: {
        station_id: data.station_id,
        part_id: data.material_part_id
      },
      transaction
    })

    if (!bufferStock) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Material buffer stock not found',
        code: 404
      }
    }

    if (Number(bufferStock.qty_pcs) < qtyReplacement) {
      await transaction.rollback()
      return {
        status: false,
        message: `Insufficient buffer stock. Available ${bufferStock.qty_pcs} PCS, requested ${qtyReplacement} PCS`,
        code: 400
      }
    }

    const labelRows = await db.sequelize.query(`
      SELECT
        pl.id AS label_id,
        pl.label_number,
        wil.id AS wo_item_label_id,
        ws.id AS stock_id,
        COALESCE(MIN(wsl.created_at), ws.created_at) AS placement_at
      FROM t_warehouse_stock ws
      JOIN t_work_order_storing_item_label wil
        ON wil.id = ws.wo_item_label_id
      JOIN t_part_labels pl
        ON pl.id = wil.label_id
      LEFT JOIN t_warehouse_stock_log wsl
        ON wsl.wh_stock_id = ws.id
        AND wsl.is_placement = true
      WHERE pl.part_id = :part_id
      GROUP BY
        pl.id,
        pl.label_number,
        wil.id,
        ws.id,
        ws.created_at
      ORDER BY placement_at ASC, ws.id ASC
      LIMIT 1
    `, {
      replacements: {
        part_id: data.material_part_id
      },
      type: QueryTypes.SELECT,
      transaction
    })

    const sourceLabel = labelRows[0] || null

    const replacement = await db.TProductionMaterialReplacement.create({
      production_result_id: data.production_result_id,
      station_id: data.station_id,
      material_part_id: data.material_part_id,
      qty_replacement: qtyReplacement,
      replacement_reason: data.replacement_reason || null,

      source_label_id: sourceLabel?.label_id || null,
      source_label_number: sourceLabel?.label_number || null,
      source_wo_item_label_id: sourceLabel?.wo_item_label_id || null,

      created_by: req.user?.id || null
    }, {
      transaction
    })

    await bufferStock.update({
      qty_pcs: Number(bufferStock.qty_pcs) - qtyReplacement
    }, {
      transaction
    })

    await transaction.commit()

    return {
      status: true,
      message: 'Replacement created successfully',
      data: replacement
    }
  } catch (error) {
    await transaction.rollback()

    return {
      status: false,
      message: error.message,
      code: 500
    }
  }
}
async dashboard(req) {
  try {
    const summaryRows = await db.sequelize.query(`
      SELECT
        COUNT(DISTINCT pmr.id)::int AS total_production_result,
        COALESCE(SUM(pmr.planning_qty), 0)::int AS total_planning_qty,
        COALESCE(SUM(pmr.actual_qty), 0)::int AS total_actual_qty,
        COALESCE(SUM(pmr.total_ok), 0)::int AS total_ok_qty,
        COALESCE(SUM(pmr.total_ng), 0)::int AS total_ng_qty
      FROM t_production_material_result pmr
      WHERE pmr.deleted_at IS NULL
    `, {
      type: QueryTypes.SELECT
    })

    const replacementRows = await db.sequelize.query(`
      SELECT
        COUNT(id)::int AS total_replacement_transaction,
        COALESCE(SUM(qty_replacement), 0)::int AS total_replacement_pcs
      FROM t_production_material_replacement
      WHERE deleted_at IS NULL
    `, {
      type: QueryTypes.SELECT
    })

    const scrapRows = await db.sequelize.query(`
      SELECT
        COUNT(id)::int AS total_scrap_transaction,
        COALESCE(SUM(qty_scrap), 0)::int AS total_scrap_pcs,
        COALESCE(SUM(total_weight), 0)::numeric AS total_scrap_weight
      FROM t_production_material_scrap
      WHERE deleted_at IS NULL
    `, {
      type: QueryTypes.SELECT
    })

    const bufferRows = await db.sequelize.query(`
      SELECT
        COUNT(bs.id)::int AS total_buffer_items,
        COUNT(bs.id) FILTER (
          WHERE bs.qty_pcs < COALESCE(p.standard_buffer_stock, 0)
        )::int AS need_replenishment_items,
        COUNT(bs.id) FILTER (
          WHERE bs.qty_pcs >= COALESCE(p.standard_buffer_stock, 0)
        )::int AS safe_buffer_items
      FROM t_station_buffer_stock bs
      JOIN s_parts p ON p.id = bs.part_id
      WHERE bs.deleted_at IS NULL
    `, {
      type: QueryTypes.SELECT
    })

    return {
      status: true,
      data: {
        ...(summaryRows[0] || {}),
        ...(replacementRows[0] || {}),
        ...(scrapRows[0] || {}),
        ...(bufferRows[0] || {})
      }
    }
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    }
  }
}
async listBufferStatus(req) {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      station_id,
      status
    } = req.query

    const offset = (Number(page) - 1) * Number(limit)

    const where = ['bs.deleted_at IS NULL']
    const replacements = {
      limit: Number(limit),
      offset
    }

    if (search) {
      where.push(`(
        p.part_number ILIKE :search OR
        p.part_name ILIKE :search OR
        st.name ILIKE :search
      )`)
      replacements.search = `%${search}%`
    }

    if (station_id) {
      where.push(`bs.station_id = :station_id`)
      replacements.station_id = station_id
    }

    const whereClause = `WHERE ${where.join(' AND ')}`

    const statusClause = status
      ? `WHERE final.buffer_status = :status`
      : ''

    if (status) replacements.status = status

    const rows = await db.sequelize.query(`
      SELECT *
      FROM (
        SELECT
          bs.id,
          bs.station_id,
          st.name AS station_name,
          bs.part_id,
          p.part_number,
          p.part_name,

          bs.qty_kanban,
          bs.qty_pcs,
          COALESCE(p.standard_buffer_stock, 0)::int AS standard_buffer_stock,

          GREATEST(COALESCE(p.standard_buffer_stock, 0) - bs.qty_pcs, 0)::int AS shortage_pcs,

          CASE
            WHEN bs.qty_pcs = 0 THEN 'Empty'
            WHEN bs.qty_pcs < COALESCE(p.standard_buffer_stock, 0) THEN 'Need Replenishment'
            ELSE 'Safe'
          END AS buffer_status,

          bs.oldest_supply_at,
          bs.latest_supply_at,

          EXTRACT(DAY FROM NOW() - bs.oldest_supply_at)::int AS aging_days

        FROM t_station_buffer_stock bs
        JOIN s_stations st ON st.id = bs.station_id
        JOIN s_parts p ON p.id = bs.part_id
        ${whereClause}
      ) final
      ${statusClause}
      ORDER BY
        CASE final.buffer_status
          WHEN 'Need Replenishment' THEN 1
          WHEN 'Empty' THEN 2
          WHEN 'Safe' THEN 3
          ELSE 4
        END,
        final.station_name ASC
      LIMIT :limit OFFSET :offset
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    const countRows = await db.sequelize.query(`
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT
          CASE
            WHEN bs.qty_pcs = 0 THEN 'Empty'
            WHEN bs.qty_pcs < COALESCE(p.standard_buffer_stock, 0) THEN 'Need Replenishment'
            ELSE 'Safe'
          END AS buffer_status
        FROM t_station_buffer_stock bs
        JOIN s_stations st ON st.id = bs.station_id
        JOIN s_parts p ON p.id = bs.part_id
        ${whereClause}
      ) final
      ${statusClause}
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    return {
      status: true,
      data: rows,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total: Number(countRows[0]?.total || 0)
      }
    }
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    }
  }
}
async dropdowns(req) {
  try {
    const [shifts, stations, products] = await Promise.all([
      db.sequelize.query(`
        SELECT id, name
        FROM s_shifts
        WHERE deleted_at IS NULL
        ORDER BY name ASC
      `, { type: QueryTypes.SELECT }),

      db.sequelize.query(`
        SELECT id, name
        FROM s_stations
        WHERE deleted_at IS NULL
        ORDER BY name ASC
      `, { type: QueryTypes.SELECT }),

      db.sequelize.query(`
        SELECT
          id,
          CONCAT(part_number, ' - ', part_name) AS name
        FROM s_parts
        WHERE deleted_at IS NULL
          AND part_type_code = 'PRODUCT'
        ORDER BY part_number ASC
      `, { type: QueryTypes.SELECT })
    ])

    return {
      status: true,
      data: {
        shifts,
        stations,
        products
      }
    }
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    }
  }
}
async getBomMaterials(req) {
  try {
    const { product_part_id } = req.params

    const rows = await db.sequelize.query(`
      SELECT
        bd.id AS bom_detail_id,
        bd.bom_id,
        bd.part_id AS material_part_id,

        material.part_number,
        material.part_name,
        material.part_category,
        material.part_type_code,

        bd.qty_required,
        bd.scrap_percentage,
        bd.sequence,

        uom.name AS uom_name,

        b.id AS bom_id,
        b.bom_number,
        b.bom_version

      FROM s_boms b
      JOIN s_bom_details bd
        ON bd.bom_id = b.id

      JOIN s_parts material
        ON material.id = bd.part_id

      LEFT JOIN s_uoms uom
        ON uom.id = bd.uom_id

      WHERE b.parent_part_id = :product_part_id
        AND b.deleted_at IS NULL
        AND bd.deleted_at IS NULL

      ORDER BY bd.sequence ASC, material.part_number ASC
    `, {
      replacements: {
        product_part_id
      },
      type: QueryTypes.SELECT
    })

    return {
      status: true,
      data: rows
    }
  } catch (error) {
    return {
      status: false,
      error: error.message,
      code: 500
    }
  }
}
async getReplacementByProductionResult(req) {
  try {
    const { production_result_id } = req.params

    const rows = await db.sequelize.query(`
      SELECT
        ng.id AS ng_detail_id,
        ng.production_result_id,
        pmr.station_id,

        ng.material_part_id,
        p.part_number,
        p.part_name,
        COALESCE(p.weight_per_pcs, 0) AS weight_per_pcs,

        ng.qty_ng AS qty_replacement,
        ng.remarks AS replacement_reason,
        ng.created_at

      FROM t_production_material_result_ng_details ng
      JOIN t_production_material_result pmr
        ON pmr.id = ng.production_result_id
      JOIN s_parts p
        ON p.id = ng.material_part_id

      WHERE ng.production_result_id = :production_result_id
        AND ng.deleted_at IS NULL
        AND pmr.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND ng.qty_ng > 0

      ORDER BY p.part_number ASC
    `, {
      replacements: { production_result_id },
      type: QueryTypes.SELECT
    })

    return {
      status: true,
      data: rows
    }
  } catch (error) {
    return {
      status: false,
      message: error.message,
      code: 500
    }
  }
}
}

export default new ProductionMaterialControlModule()