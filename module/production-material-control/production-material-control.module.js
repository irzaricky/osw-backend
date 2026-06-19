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

    const productionResultIds = rows.map(row => row.id)

let ngDetails = []

if (productionResultIds.length) {
  ngDetails = await db.sequelize.query(`
    SELECT
      ng.id,
      ng.production_result_id,
      ng.material_part_id,

      part.part_number AS material_part_number,
      part.part_name AS material_part_name,

      ng.qty_ng,
      ng.remarks,
      ng.created_at

    FROM t_production_material_result_ng_details ng
    JOIN s_parts part
      ON part.id = ng.material_part_id

    WHERE ng.production_result_id IN (:production_result_ids)
      AND ng.deleted_at IS NULL

    ORDER BY ng.id ASC
  `, {
    replacements: {
      production_result_ids: productionResultIds
    },
    type: QueryTypes.SELECT
  })
}

    const ngDetailsMap = ngDetails.reduce((map, item) => {
      if (!map[item.production_result_id]) {
        map[item.production_result_id] = []
      }

      map[item.production_result_id].push(item)

      return map
    }, {})

    const rowsWithNgMaterials = rows.map(row => ({
      ...row,
      ng_materials: ngDetailsMap[row.id] || []
    }))

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
      data: rowsWithNgMaterials,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total
      }
    }
  } catch (error) {
    return {
      status: false,
      message: error.message,
      code: 500
    }
  }
}

  async createProductionResult(req) {
  const transaction = await db.sequelize.transaction()

  try {
    const data = req.body
    const actualQty = Number(data.actual_qty || 0)
    const totalOk = Number(data.total_ok || 0)
    const totalNg = Number(data.total_ng || 0)
    const planningQty = Number(data.planning_qty || 0)

    if (!data.production_date) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Production date is required',
        code: 400
      }
    }

    if (!data.shift_id) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Shift is required',
        code: 400
      }
    }

    if (!data.station_id) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Station is required',
        code: 400
      }
    }

    if (!data.part_id) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Product part is required',
        code: 400
      }
    }

    if (actualQty <= 0) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Actual quantity must be greater than 0',
        code: 400
      }
    }

    if (totalOk + totalNg !== actualQty) {
      await transaction.rollback()
      return {
        status: false,
        message: `Actual quantity (${actualQty}) must be equal to OK (${totalOk}) + NG (${totalNg})`,
        code: 400
      }
    }

    if (planningQty > 0 && actualQty > planningQty) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Actual quantity cannot exceed planning quantity',
        code: 400
      }
    }

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
      production_wo_id: data.production_wo_id || null,
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
            source_label_id,
            source_label_number,
            qty_ng,
            remarks,
            created_by,
            created_at,
            updated_at
          )
        VALUES
          (
            :production_result_id,
            :material_part_id,
            :source_label_id,
            :source_label_number,
            :qty_ng,
            :remarks,
            :created_by,
            NOW(),
            NOW()
          )
        `, {
          replacements: {
          production_result_id: result.id,
          material_part_id: item.material_part_id,
          source_label_id: item.label_id || null,
          source_label_number: item.label_number || null,
          qty_ng: qtyNg,
          remarks: item.remarks || null,
          created_by: req.user?.id || null
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
      message: error.message,
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
        r.replacement_reason ILIKE :search OR
        u.email ILIKE :search
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

        r.created_by,
        u.email AS created_by_email,

        r.created_at

      FROM t_production_material_replacement r
      JOIN s_stations st ON st.id = r.station_id
      JOIN s_parts p ON p.id = r.material_part_id
      LEFT JOIN s_users u ON u.id = r.created_by

      ${whereClause}

      ORDER BY r.id DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    const replacementIds = rows.map(row => row.id)

    let detailRows = []

    if (replacementIds.length) {
      detailRows = await db.sequelize.query(`
        SELECT
          detail.id,
          detail.used_reference_id AS replacement_id,
          detail.source_label_id,
          detail.source_label_number,
          detail.source_wo_item_label_id,
          detail.pcs_no,
          detail.pcs_label_number,
          detail.status,
          detail.created_by,
          supplied_user.email AS supplied_by_email,
          detail.used_at,
          detail.created_at

        FROM t_station_buffer_stock_detail detail
        LEFT JOIN s_users supplied_user
          ON supplied_user.id = detail.created_by

        WHERE detail.used_reference_type = 'PRODUCTION_REPLACEMENT'
          AND detail.used_reference_id IN (:replacement_ids)
          AND detail.deleted_at IS NULL

        ORDER BY detail.used_reference_id ASC, detail.used_at ASC, detail.id ASC
      `, {
        replacements: {
          replacement_ids: replacementIds
        },
        type: QueryTypes.SELECT
      })
    }

    const detailMap = detailRows.reduce((map, item) => {
      if (!map[item.replacement_id]) {
        map[item.replacement_id] = []
      }

      map[item.replacement_id].push(item)

      return map
    }, {})

    const rowsWithDetails = rows.map(row => ({
      ...row,
      used_buffer_details: detailMap[row.id] || []
    }))

    const countRows = await db.sequelize.query(`
      SELECT COUNT(*)::int AS total
      FROM t_production_material_replacement r
      JOIN s_stations st ON st.id = r.station_id
      JOIN s_parts p ON p.id = r.material_part_id
      LEFT JOIN s_users u ON u.id = r.created_by
      ${whereClause}
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    const total = Number(countRows[0]?.total || 0)

    return {
      status: true,
      data: rowsWithDetails,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total
      }
    }
  } catch (error) {
    return {
      status: false,
      message: error.message,
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

    const bufferDetails = await db.TStationBufferStockDetail.findAll({
      where: {
        buffer_stock_id: bufferStock.id,
        status: 'AVAILABLE'
      },
      order: [
        ['created_at', 'ASC'],
        ['id', 'ASC']
      ],
      limit: qtyReplacement,
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (bufferDetails.length < qtyReplacement) {
      await transaction.rollback()
      return {
        status: false,
        message: `Available buffer label detail only ${bufferDetails.length} PCS, requested ${qtyReplacement} PCS`,
        code: 400
      }
    }

    const firstDetail = bufferDetails[0]

    const sourceLabel = labelRows[0] || null

    const replacement = await db.TProductionMaterialReplacement.create({
      production_result_id: data.production_result_id,
      station_id: data.station_id,
      material_part_id: data.material_part_id,
      qty_replacement: qtyReplacement,
      replacement_reason: data.replacement_reason || null,

      source_label_id: firstDetail?.source_label_id || null,
      source_label_number: firstDetail?.source_label_number || null,
      source_wo_item_label_id: firstDetail?.source_wo_item_label_id || null,

      created_by: req.user?.id || null
    }, {
      transaction
    })

    await db.TStationBufferStockDetail.update({
      status: 'USED',
      used_reference_type: 'PRODUCTION_REPLACEMENT',
      used_reference_id: replacement.id,
      used_at: new Date()
    }, {
      where: {
        id: bufferDetails.map(item => item.id)
      },
      transaction
    })

    await bufferStock.update({
      qty_pcs: Number(bufferStock.qty_pcs) - qtyReplacement
    }, {
      transaction
    })

    await db.TStationBufferStockLog.create({
      buffer_stock_id: bufferStock.id,
      transaction_type: 'OUT',
      qty_kanban: 0,
      qty_pcs: qtyReplacement,
      reference_type: 'PRODUCTION_REPLACEMENT',
      reference_id: replacement.id,
      remarks: 'Material replacement from station buffer',
      created_by: req.user?.id || null
    }, {
      transaction
    })

    await transaction.commit()

    return {
      status: true,
      message: 'Replacement created successfully',
      data: {
        ...replacement.toJSON(),
        used_buffer_details: bufferDetails
      }
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
      message: error.message,
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

    const bufferStockIds = rows.map(row => row.id)

    let detailRows = []

    if (bufferStockIds.length) {
      detailRows = await db.sequelize.query(`
        SELECT
          detail.id,
          detail.buffer_stock_id,
          detail.source_label_id,
          detail.source_label_number,
          detail.source_wo_item_label_id,
          detail.pcs_no,
          detail.pcs_label_number,
          detail.status,
          detail.created_by,
          usr.email AS supplied_by_email,
          detail.created_at
        FROM t_station_buffer_stock_detail
        LEFT JOIN s_users usr
          ON usr.id = detail.created_by
        WHERE buffer_stock_id IN (:buffer_stock_ids)
          AND detail.status = 'AVAILABLE'
          AND detail.deleted_at IS NULL
        ORDER BY detail.created_at ASC, detail.id ASC
      `, {
        replacements: { buffer_stock_ids: bufferStockIds },
        type: QueryTypes.SELECT
      })
    }

    const detailMap = detailRows.reduce((map, item) => {
      if (!map[item.buffer_stock_id]) {
        map[item.buffer_stock_id] = []
      }

      map[item.buffer_stock_id].push(item)

      return map
    }, {})

    const rowsWithDetails = rows.map(row => ({
      ...row,
      buffer_details: detailMap[row.id] || []
    }))

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
      data: rowsWithDetails,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total: Number(countRows[0]?.total || 0)
      }
    }
  } catch (error) {
    return {
      status: false,
      message: error.message,
      code: 500
    }
  }
}
async listBufferTransaction(req) {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      transaction_type,
      station_id,
      date_from,
      date_to
    } = req.query

    const offset = (Number(page) - 1) * Number(limit)

    const where = ['log.deleted_at IS NULL']
    const replacements = {
      limit: Number(limit),
      offset
    }

    if (search) {
      where.push(`(
        p.part_number ILIKE :search OR
        p.part_name ILIKE :search OR
        st.name ILIKE :search OR
        usr.email ILIKE :search
      )`)
      replacements.search = `%${search}%`
    }

    if (transaction_type) {
      where.push(`log.transaction_type = :transaction_type`)
      replacements.transaction_type = transaction_type
    }

    if (station_id) {
      where.push(`bs.station_id = :station_id`)
      replacements.station_id = station_id
    }

    if (date_from) {
      where.push(`DATE(log.created_at) >= DATE(:date_from)`)
      replacements.date_from = date_from
    }

    if (date_to) {
      where.push(`DATE(log.created_at) <= DATE(:date_to)`)
      replacements.date_to = date_to
    }

    const whereClause = `WHERE ${where.join(' AND ')}`

    const rows = await db.sequelize.query(`
      SELECT
        log.id,
        log.buffer_stock_id,
        log.transaction_type,
        log.qty_kanban,
        log.qty_pcs,
        log.reference_type,
        log.reference_id,
        log.remarks,
        log.created_by,
        usr.email AS user_email,
        log.created_at,

        bs.station_id,
        st.name AS station_name,

        bs.part_id,
        p.part_number,
        p.part_name

      FROM t_station_buffer_stock_log log
      JOIN t_station_buffer_stock bs
        ON bs.id = log.buffer_stock_id
      JOIN s_stations st
        ON st.id = bs.station_id
      JOIN s_parts p
        ON p.id = bs.part_id
      LEFT JOIN s_users usr
        ON usr.id = log.created_by

      ${whereClause}

      ORDER BY log.created_at DESC, log.id DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    const logIds = rows.map(row => row.id)
    const referenceIds = rows.map(row => row.reference_id).filter(Boolean)

    let detailRows = []

    if (rows.length) {
      detailRows = await db.sequelize.query(`
        SELECT
          detail.id,
          detail.source_reference_id,
          detail.used_reference_id,
          detail.source_reference_type,
          detail.used_reference_type,
          detail.source_label_number,
          detail.pcs_label_number,
          detail.status,
          detail.created_at,
          detail.used_at

        FROM t_station_buffer_stock_detail detail

        WHERE detail.deleted_at IS NULL
          AND (
            detail.source_reference_id IN (:reference_ids)
            OR detail.used_reference_id IN (:reference_ids)
          )

        ORDER BY detail.created_at ASC, detail.id ASC
      `, {
        replacements: {
          reference_ids: referenceIds.length ? referenceIds : [0]
        },
        type: QueryTypes.SELECT
      })
    }

    const rowsWithDetails = rows.map(row => {
      const details = detailRows.filter(detail => {
        if (row.transaction_type === 'IN') {
          return (
            Number(detail.source_reference_id) === Number(row.reference_id) &&
            detail.source_reference_type === row.reference_type
          )
        }

        if (row.transaction_type === 'OUT') {
          return (
            Number(detail.used_reference_id) === Number(row.reference_id) &&
            detail.used_reference_type === row.reference_type
          )
        }

        return false
      })

      return {
        ...row,
        labels: details
      }
    })

    const countRows = await db.sequelize.query(`
      SELECT COUNT(*)::int AS total

      FROM t_station_buffer_stock_log log
      JOIN t_station_buffer_stock bs
        ON bs.id = log.buffer_stock_id
      JOIN s_stations st
        ON st.id = bs.station_id
      JOIN s_parts p
        ON p.id = bs.part_id
      LEFT JOIN s_users usr
        ON usr.id = log.created_by

      ${whereClause}
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    return {
      status: true,
      data: rowsWithDetails,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total: Number(countRows[0]?.total || 0)
      }
    }
  } catch (error) {
    return {
      status: false,
      message: error.message,
      code: 500
    }
  }
}

async dropdowns(req) {
  try {
    const [shifts, stations, products] = await Promise.all([
      db.sequelize.query(`
        SELECT
        id,
        name,
        description,
        start_time,
        end_time,
        shift_number,
        category,
        type
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
      message: error.message,
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
      message: error.message,
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
async getProductionWos(req) {
  try {
    const rows = await db.sequelize.query(`
      SELECT
        wo.id AS wo_id,
        wo.wo_number,
        wo.planned_quantity,

        wo.part_id,
        product.part_number,
        product.part_name,

        wos.station_id,
        st.name AS station_name

      FROM s_work_orders wo
      JOIN s_parts product
        ON product.id = wo.part_id

      LEFT JOIN t_work_order_storing wos
        ON wos.production_wo_id = wo.id
        AND wos.take_out_purpose = 'production'
        AND wos.deleted_at IS NULL

      LEFT JOIN s_stations st
        ON st.id = wos.station_id

      WHERE wo.deleted_at IS NULL

      ORDER BY wo.wo_number DESC
    `, {
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
async getProductionWoMaterialLabels(req) {
  try {
    const { production_wo_id } = req.params

    const rows = await db.sequelize.query(`
      SELECT
        wil.id AS wo_item_label_id,
        lbl.id AS label_id,
        lbl.label_number,

        item.part_id AS material_part_id,
        part.part_number,
        part.part_name,

        wos.id AS wo_storing_id,
        wos.wo_number AS wo_storing_number,
        wos.station_id,
        st.name AS station_name

      FROM t_work_order_storing wos
      JOIN t_work_order_storing_item item
        ON item.wo_id = wos.id
        AND item.deleted_at IS NULL

      JOIN t_work_order_storing_item_label wil
        ON wil.wo_item_id = item.id
        AND wil.deleted_at IS NULL

      JOIN t_part_labels lbl
        ON lbl.id = wil.label_id
        AND lbl.deleted_at IS NULL

      JOIN s_parts part
        ON part.id = item.part_id
        AND part.deleted_at IS NULL

      LEFT JOIN s_stations st
        ON st.id = wos.station_id

      WHERE wos.production_wo_id = :production_wo_id
        AND wos.take_out_purpose = 'production'
        AND wos.deleted_at IS NULL

      ORDER BY part.part_number ASC, lbl.label_number ASC
    `, {
      replacements: { production_wo_id },
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