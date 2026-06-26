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
      has_ng,
      has_pending_scrap
    } = req.query

    const offset = (Number(page) - 1) * Number(limit)

    const where = ['pmr.deleted_at IS NULL']
    const replacements = {
      limit: Number(limit),
      offset
    }

    if (search) {
      where.push(`(
        wo.wo_number ILIKE :search OR
        product.part_number ILIKE :search OR
        product.part_name ILIKE :search OR
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
      where.push(`
        EXISTS (
          SELECT 1
          FROM t_production_material_result_ng_details ng
          WHERE ng.production_result_id = pmr.id
            AND ng.deleted_at IS NULL
            AND ng.qty_ng > 0
            AND NOT EXISTS (
              SELECT 1
              FROM t_production_material_replacement r
              WHERE r.ng_detail_id = ng.id
                AND r.deleted_at IS NULL
            )
        )
      `)
    }

    if (has_pending_scrap === 'true' || has_pending_scrap === true) {
      where.push(`
        EXISTS (
          SELECT 1
          FROM t_production_material_replacement r
          WHERE r.production_result_id = pmr.id
            AND r.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM t_production_material_scrap scrap
              WHERE scrap.replacement_id = r.id
                AND scrap.deleted_at IS NULL
            )
        )
      `)
    }

    const whereClause = `WHERE ${where.join(' AND ')}`

    const rows = await db.sequelize.query(`
      SELECT
        pmr.id,
        pmr.production_wo_id,
        wo.wo_number,

        pmr.production_date,

        pmr.shift_id,
        sh.name AS shift_name,

        pmr.station_id,
        st.name AS station_name,

        pmr.part_id,
        product.part_number AS product_part_number,
        product.part_name AS product_part_name,

        pmr.planning_qty,
        pmr.actual_qty,
        pmr.total_ok,
        pmr.total_ng,
        pmr.remarks,
        pmr.created_at

      FROM t_production_material_result pmr
      JOIN s_work_orders wo
        ON wo.id = pmr.production_wo_id
      JOIN s_shifts sh
        ON sh.id = pmr.shift_id
      JOIN s_stations st
        ON st.id = pmr.station_id
      JOIN s_parts product
        ON product.id = pmr.part_id

      ${whereClause}

      ORDER BY pmr.production_date DESC, pmr.id DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    const productionResultIds = rows.map(row => row.id)

    let ngDetails = []
    let usedMaterials = []

    if (productionResultIds.length) {
      ngDetails = await db.sequelize.query(`
        SELECT
          ng.id,
          ng.production_result_id,
          ng.material_part_id,

          part.part_number AS material_part_number,
          part.part_name AS material_part_name,

          ng.source_label_id,
          ng.source_label_number,
          ng.source_wo_item_label_id,

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

      usedMaterials = await db.sequelize.query(`
        SELECT
          pmr.id AS production_result_id,

          item.part_id AS material_part_id,
          part.part_number AS material_part_number,
          part.part_name AS material_part_name,

          wil.id AS wo_item_label_id,
          lbl.id AS label_id,
          lbl.label_number,

          wos.id AS wo_storing_id,
          wos.wo_number AS wo_storing_number,

          wil.is_scanned_out,
          wil.created_at

        FROM t_production_material_result pmr

        JOIN t_work_order_storing wos
          ON wos.production_wo_id = pmr.production_wo_id
          AND wos.station_id = pmr.station_id
          AND wos.take_out_purpose = 'production'
          AND wos.deleted_at IS NULL

        JOIN t_work_order_storing_item item
          ON item.wo_id = wos.id
          AND item.deleted_at IS NULL

        JOIN s_parts part
          ON part.id = item.part_id
          AND part.deleted_at IS NULL

        JOIN t_work_order_storing_item_label wil
          ON wil.wo_item_id = item.id
          AND wil.is_scanned_out = true
          AND wil.deleted_at IS NULL

        JOIN t_part_labels lbl
          ON lbl.id = wil.label_id
          AND lbl.deleted_at IS NULL

        WHERE pmr.id IN (:production_result_ids)
          AND pmr.deleted_at IS NULL

        ORDER BY pmr.id ASC, part.part_number ASC, lbl.label_number ASC
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

    const usedMaterialMap = usedMaterials.reduce((map, item) => {
      if (!map[item.production_result_id]) {
        map[item.production_result_id] = {}
      }

      if (!map[item.production_result_id][item.material_part_id]) {
        map[item.production_result_id][item.material_part_id] = {
          material_part_id: item.material_part_id,
          material_part_number: item.material_part_number,
          material_part_name: item.material_part_name,
          labels: []
        }
      }

      map[item.production_result_id][item.material_part_id].labels.push({
        wo_item_label_id: item.wo_item_label_id,
        label_id: item.label_id,
        label_number: item.label_number,
        wo_storing_id: item.wo_storing_id,
        wo_storing_number: item.wo_storing_number,
        is_scanned_out: item.is_scanned_out,
        created_at: item.created_at
      })

      return map
    }, {})

    const rowsWithDetails = rows.map(row => ({
      ...row,
      used_materials: Object.values(usedMaterialMap[row.id] || {}),
      ng_materials: ngDetailsMap[row.id] || []
    }))

    const countRows = await db.sequelize.query(`
      SELECT COUNT(*)::int AS total

      FROM t_production_material_result pmr
      JOIN s_work_orders wo
        ON wo.id = pmr.production_wo_id
      JOIN s_stations st
        ON st.id = pmr.station_id
      JOIN s_parts product
        ON product.id = pmr.part_id

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

async createProductionResult(req) {
  const transaction = await db.sequelize.transaction()

  try {
    const data = req.body

    if (!data.production_wo_id) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Production Work Order is required',
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

    const actualQty = Number(data.actual_qty || 0)
    const totalOk = Number(data.total_ok || 0)
    const totalNg = Number(data.total_ng || 0)

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

    const [productionWo] = await db.sequelize.query(`
      SELECT
        id,
        work_date,
        shift_id,
        part_id,
        planned_quantity
      FROM s_work_orders
      WHERE id = :production_wo_id
        AND deleted_at IS NULL
      LIMIT 1
    `, {
      replacements: {
        production_wo_id: data.production_wo_id
      },
      type: QueryTypes.SELECT,
      transaction
    })

    if (!productionWo) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Production Work Order not found',
        code: 404
      }
    }

    const planningQty = Number(productionWo.planned_quantity || 0)

    if (planningQty > 0 && actualQty > planningQty) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Actual quantity cannot exceed planning quantity',
        code: 400
      }
    }

    const [woStation] = await db.sequelize.query(`
      SELECT
        id,
        station_id
      FROM s_work_order_stations
      WHERE wo_id = :production_wo_id
        AND station_id = :station_id
      LIMIT 1
    `, {
      replacements: {
        production_wo_id: data.production_wo_id,
        station_id: data.station_id
      },
      type: QueryTypes.SELECT,
      transaction
    })

    if (!woStation) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Selected station is not part of Production Work Order',
        code: 400
      }
    }

    const [existingResult] = await db.sequelize.query(`
      SELECT id
      FROM t_production_material_result
      WHERE production_wo_id = :production_wo_id
        AND station_id = :station_id
        AND deleted_at IS NULL
      LIMIT 1
    `, {
      replacements: {
        production_wo_id: data.production_wo_id,
        station_id: data.station_id
      },
      type: QueryTypes.SELECT,
      transaction
    })

    if (existingResult) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Production result for this station already exists',
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

    const validMaterials = await db.sequelize.query(`
      SELECT
        wom.material_part_id
      FROM s_work_order_materials wom
      JOIN s_work_order_stations wost
        ON wost.id = wom.wo_station_id
      WHERE wost.wo_id = :production_wo_id
        AND wost.station_id = :station_id
        AND wom.deleted_at IS NULL
    `, {
      replacements: {
        production_wo_id: data.production_wo_id,
        station_id: data.station_id
      },
      type: QueryTypes.SELECT,
      transaction
    })

    const validMaterialIds = validMaterials.map(item =>
      Number(item.material_part_id)
    )

    for (const item of ngMaterials) {
      const materialPartId = Number(item.material_part_id)
      const qtyNg = Number(item.qty_ng || 0)

      if (qtyNg > 0 && !validMaterialIds.includes(materialPartId)) {
        await transaction.rollback()
        return {
          status: false,
          message: `Material ${materialPartId} is not part of selected Production Work Order`,
          code: 400
        }
      }
    }

    const result = await db.TProductionMaterialResult.create({
      production_wo_id: productionWo.id,
      production_date: productionWo.work_date,
      shift_id: productionWo.shift_id,
      station_id: data.station_id,
      part_id: productionWo.part_id,
      material_part_id: null,
      planning_qty: planningQty,
      actual_qty: actualQty,
      total_ok: totalOk,
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
            source_wo_item_label_id,
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
            :source_wo_item_label_id,
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
            source_wo_item_label_id: item.wo_item_label_id || null,
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
        scrap.remarks ILIKE :search OR
        usr.email ILIKE :search
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
        scrap.replacement_id,

        scrap.part_id,
        product.part_number AS product_part_number,
        product.part_name AS product_part_name,

        scrap.material_part_id,
        material.part_number AS material_part_number,
        material.part_name AS material_part_name,

        replacement.ng_detail_id,

        ng.source_label_id AS ng_source_label_id,
        ng.source_label_number AS ng_source_label_number,

        scrap.qty_scrap,
        scrap.weight_per_pcs,
        scrap.total_weight,
        scrap.remarks,

        scrap.created_by,
        usr.email AS created_by_email,

        scrap.created_at

      FROM t_production_material_scrap scrap

      JOIN s_parts product
        ON product.id = scrap.part_id

      JOIN s_parts material
        ON material.id = scrap.material_part_id

      LEFT JOIN t_production_material_replacement replacement
        ON replacement.id = scrap.replacement_id
        AND replacement.deleted_at IS NULL

      LEFT JOIN t_production_material_result_ng_details ng
        ON ng.id = replacement.ng_detail_id
        AND ng.deleted_at IS NULL

      LEFT JOIN s_users usr
        ON usr.id = scrap.created_by

      ${whereClause}

      ORDER BY scrap.scrap_date DESC, scrap.id DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    const replacementIds = rows
      .map(row => row.replacement_id)
      .filter(Boolean)

    let labelRows = []

    if (replacementIds.length) {
      labelRows = await db.sequelize.query(`
        SELECT
          detail.id,
          detail.used_reference_id AS replacement_id,
          detail.source_label_id,
          detail.source_label_number,
          detail.pcs_no,
          detail.pcs_label_number,
          detail.status,
          detail.used_at
        FROM t_station_buffer_stock_detail detail
        WHERE detail.used_reference_type = 'PRODUCTION_REPLACEMENT'
          AND detail.used_reference_id IN (:replacement_ids)
          AND detail.deleted_at IS NULL
        ORDER BY detail.used_reference_id ASC, detail.id ASC
      `, {
        replacements: {
          replacement_ids: replacementIds
        },
        type: QueryTypes.SELECT
      })
    }

    const labelMap = labelRows.reduce((map, item) => {
      if (!map[item.replacement_id]) {
        map[item.replacement_id] = []
      }

      map[item.replacement_id].push(item)

      return map
    }, {})

    const rowsWithLabels = rows.map(row => ({
      ...row,
      replacement_labels: labelMap[row.replacement_id] || []
    }))

    const countRows = await db.sequelize.query(`
      SELECT COUNT(*)::int AS total
      FROM t_production_material_scrap scrap

      JOIN s_parts product
        ON product.id = scrap.part_id

      JOIN s_parts material
        ON material.id = scrap.material_part_id

      LEFT JOIN t_production_material_replacement replacement
        ON replacement.id = scrap.replacement_id
        AND replacement.deleted_at IS NULL

      LEFT JOIN t_production_material_result_ng_details ng
        ON ng.id = replacement.ng_detail_id
        AND ng.deleted_at IS NULL

      LEFT JOIN s_users usr
        ON usr.id = scrap.created_by

      ${whereClause}
    `, {
      replacements,
      type: QueryTypes.SELECT
    })

    return {
      status: true,
      data: rowsWithLabels,
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

    if (!data.replacement_id) {
      return {
        status: false,
        message: 'Replacement is required',
        code: 400
      }
    }

    const [replacement] = await db.sequelize.query(`
      SELECT
        r.id AS replacement_id,
        r.production_result_id,
        r.station_id,
        r.material_part_id,
        r.qty_replacement,
        r.ng_detail_id,

        pmr.part_id,

        material.part_number,
        material.part_name,
        material.weight_per_pcs
      FROM t_production_material_replacement r
      JOIN t_production_material_result pmr
        ON pmr.id = r.production_result_id
        AND pmr.deleted_at IS NULL
      JOIN s_parts material
        ON material.id = r.material_part_id
        AND material.deleted_at IS NULL
      WHERE r.id = :replacement_id
        AND r.deleted_at IS NULL
      LIMIT 1
    `, {
      replacements: {
        replacement_id: data.replacement_id
      },
      type: QueryTypes.SELECT
    })

    if (!replacement) {
      return {
        status: false,
        message: 'Replacement material not found',
        code: 404
      }
    }

    const [existingScrap] = await db.sequelize.query(`
      SELECT id
      FROM t_production_material_scrap
      WHERE replacement_id = :replacement_id
        AND deleted_at IS NULL
      LIMIT 1
    `, {
      replacements: {
        replacement_id: data.replacement_id
      },
      type: QueryTypes.SELECT
    })

    if (existingScrap) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Scrap for this replacement already exists',
        code: 400
      }
    }

    const qtyScrap = Number(data.qty_scrap || 0)
    const weightPerPcs = Number(replacement.weight_per_pcs || 0)

    if (qtyScrap <= 0) {
      return {
        status: false,
        message: 'Scrap quantity must be greater than 0',
        code: 400
      }
    }

    if (qtyScrap > Number(replacement.qty_replacement || 0)) {
      return {
        status: false,
        message: `Scrap quantity cannot exceed replacement quantity (${replacement.qty_replacement} PCS)`,
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
      production_result_id: replacement.production_result_id,
      replacement_id: replacement.replacement_id,
      scrap_date: data.scrap_date,
      station_id: replacement.station_id,
      part_id: replacement.part_id,
      material_part_id: replacement.material_part_id,
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

    if (!data.ng_detail_id) {
      await transaction.rollback()
      return {
        status: false,
        message: 'NG detail is required',
        code: 400
      }
    }

    if (qtyReplacement <= 0) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Replacement quantity must be greater than 0',
        code: 400
      }
    }

    const [ngDetail] = await db.sequelize.query(`
      SELECT
        ng.id,
        ng.production_result_id,
        pmr.station_id,
        ng.material_part_id,
        ng.source_label_id,
        ng.source_label_number,
        ng.source_wo_item_label_id,
        ng.qty_ng
      FROM t_production_material_result_ng_details ng
      JOIN t_production_material_result pmr
        ON pmr.id = ng.production_result_id
      WHERE ng.id = :ng_detail_id
        AND ng.deleted_at IS NULL
        AND pmr.deleted_at IS NULL
      LIMIT 1
    `, {
      replacements: {
        ng_detail_id: data.ng_detail_id
      },
      type: QueryTypes.SELECT,
      transaction
    })

    if (!ngDetail) {
      await transaction.rollback()
      return {
        status: false,
        message: 'NG detail not found',
        code: 404
      }
    }

    const [existingReplacement] = await db.sequelize.query(`
      SELECT id
      FROM t_production_material_replacement
      WHERE ng_detail_id = :ng_detail_id
        AND deleted_at IS NULL
      LIMIT 1
    `, {
      replacements: {
        ng_detail_id: data.ng_detail_id
      },
      type: QueryTypes.SELECT,
      transaction
    })

    if (existingReplacement) {
      await transaction.rollback()
      return {
        status: false,
        message: 'Replacement for this NG material already exists',
        code: 400
      }
    }

    if (Number(ngDetail.production_result_id) !== Number(data.production_result_id)) {
      await transaction.rollback()
      return {
        status: false,
        message: 'NG detail does not match selected production result',
        code: 400
      }
    }

    if (Number(ngDetail.material_part_id) !== Number(data.material_part_id)) {
      await transaction.rollback()
      return {
        status: false,
        message: 'NG material does not match selected material',
        code: 400
      }
    }

    if (qtyReplacement > Number(ngDetail.qty_ng || 0)) {
      await transaction.rollback()
      return {
        status: false,
        message: `Replacement quantity cannot exceed NG quantity (${ngDetail.qty_ng} PCS)`,
        code: 400
      }
    }



    const bufferStock = await db.TStationBufferStock.findOne({
      where: {
        station_id: ngDetail.station_id,
        part_id: ngDetail.material_part_id
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

    const replacement = await db.TProductionMaterialReplacement.create({
      production_result_id: ngDetail.production_result_id,
      ng_detail_id: ngDetail.id,
      station_id: ngDetail.station_id,
      material_part_id: ngDetail.material_part_id,
      qty_replacement: qtyReplacement,
      replacement_reason: data.replacement_reason || null,

      // ini label material NG asal, bukan label replacement
      source_label_id: ngDetail.source_label_id || null,
      source_label_number: ngDetail.source_label_number || null,
      source_wo_item_label_id: ngDetail.source_wo_item_label_id || null,

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
        FROM t_station_buffer_stock_detail detail
        LEFT JOIN s_users usr
          ON usr.id = detail.created_by
        WHERE detail.buffer_stock_id IN (:buffer_stock_ids)
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

        ng.source_label_id AS ng_source_label_id,
        ng.source_label_number AS ng_source_label_number,

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
        AND NOT EXISTS (
          SELECT 1
          FROM t_production_material_replacement r
          WHERE r.ng_detail_id = ng.id
            AND r.deleted_at IS NULL
        )

      ORDER BY p.part_number ASC, ng.source_label_number ASC
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
async getReplacementForScrap(req) {
  try {
    const { production_result_id } = req.params

    const rows = await db.sequelize.query(`
      SELECT
        r.id AS replacement_id,
        r.production_result_id,
        r.ng_detail_id,
        r.station_id,

        r.material_part_id,
        p.part_number,
        p.part_name,
        COALESCE(p.weight_per_pcs, 0) AS weight_per_pcs,

        r.qty_replacement,

        r.source_label_id AS ng_source_label_id,
        r.source_label_number AS ng_source_label_number,

        r.created_at

      FROM t_production_material_replacement r
      JOIN s_parts p
        ON p.id = r.material_part_id

      WHERE r.production_result_id = :production_result_id
        AND r.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM t_production_material_scrap scrap
          WHERE scrap.replacement_id = r.id
            AND scrap.deleted_at IS NULL
        )

      ORDER BY r.id DESC
    `, {
      replacements: { production_result_id },
      type: QueryTypes.SELECT
    })

    const replacementIds = rows.map(row => row.replacement_id)

    let labelRows = []

    if (replacementIds.length) {
      labelRows = await db.sequelize.query(`
        SELECT
          detail.id,
          detail.used_reference_id AS replacement_id,
          detail.pcs_label_number
        FROM t_station_buffer_stock_detail detail
        WHERE detail.used_reference_type = 'PRODUCTION_REPLACEMENT'
          AND detail.used_reference_id IN (:replacement_ids)
          AND detail.deleted_at IS NULL
        ORDER BY detail.used_reference_id ASC, detail.id ASC
      `, {
        replacements: { replacement_ids: replacementIds },
        type: QueryTypes.SELECT
      })
    }

    const labelMap = labelRows.reduce((map, item) => {
      if (!map[item.replacement_id]) map[item.replacement_id] = []
      map[item.replacement_id].push(item)
      return map
    }, {})

    return {
      status: true,
      data: rows.map(row => ({
        ...row,
        replacement_labels: labelMap[row.replacement_id] || []
      }))
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
        wo.work_date AS production_date,
        wo.planned_quantity AS planning_qty,
        wo.actual_quantity,

        wo.shift_id,
        sh.name AS shift_name,
        sh.description AS shift_description,
        sh.start_time,
        sh.end_time,

        wo.part_id,
        product.part_number,
        product.part_name,

        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'station_id', wost.station_id,
              'station_name', st.name,
              'sequence', wost.sequence,
              'planned_quantity', wost.planned_quantity,
              'actual_quantity', wost.actual_quantity,
              'status', wost.status
            )
          ) FILTER (WHERE wost.station_id IS NOT NULL),
          '[]'
        ) AS stations

      FROM s_work_orders wo
      JOIN s_parts product
        ON product.id = wo.part_id

      JOIN s_shifts sh
        ON sh.id = wo.shift_id

      LEFT JOIN s_work_order_stations wost
        ON wost.wo_id = wo.id

      LEFT JOIN s_stations st
        ON st.id = wost.station_id

      WHERE wo.deleted_at IS NULL

      GROUP BY
        wo.id,
        wo.wo_number,
        wo.work_date,
        wo.planned_quantity,
        wo.actual_quantity,
        wo.shift_id,
        sh.name,
        sh.description,
        sh.start_time,
        sh.end_time,
        wo.part_id,
        product.part_number,
        product.part_name

      ORDER BY wo.work_date DESC, wo.wo_number DESC
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
    const { production_wo_id, station_id } = req.params

    const rows = await db.sequelize.query(`
      SELECT
        wom.material_part_id,
        part.part_number,
        part.part_name,
        COALESCE(wom.planned_quantity, 0) AS planned_quantity,
        COALESCE(wom.actual_quantity, 0) AS actual_quantity,
        wom.uom,

        wil.id AS wo_item_label_id,
        lbl.id AS label_id,
        lbl.label_number,

        wos.id AS wo_storing_id,
        wos.wo_number AS wo_storing_number,
        wost.station_id,
        st.name AS station_name

      FROM s_work_order_materials wom

      JOIN s_work_order_stations wost
        ON wost.id = wom.wo_station_id

      JOIN s_stations st
        ON st.id = wost.station_id

      JOIN s_parts part
        ON part.id = wom.material_part_id
        AND part.deleted_at IS NULL

      LEFT JOIN t_work_order_storing wos
        ON wos.production_wo_id = wost.wo_id
        AND wos.station_id = wost.station_id
        AND wos.take_out_purpose = 'production'
        AND wos.deleted_at IS NULL

      LEFT JOIN t_work_order_storing_item item
        ON item.wo_id = wos.id
        AND item.part_id = wom.material_part_id
        AND item.deleted_at IS NULL

      LEFT JOIN t_work_order_storing_item_label wil
        ON wil.wo_item_id = item.id
        AND wil.is_scanned_out = true
        AND wil.deleted_at IS NULL

      LEFT JOIN t_part_labels lbl
        ON lbl.id = wil.label_id
        AND lbl.deleted_at IS NULL

      WHERE wost.wo_id = :production_wo_id
        AND wost.station_id = :station_id
        AND wom.deleted_at IS NULL

      ORDER BY part.part_number ASC, lbl.label_number ASC
    `, {
      replacements: {
        production_wo_id,
        station_id
      },
      type: QueryTypes.SELECT
    })

    const materialMap = rows.reduce((map, row) => {
      if (!map[row.material_part_id]) {
        map[row.material_part_id] = {
          material_part_id: row.material_part_id,
          part_number: row.part_number,
          part_name: row.part_name,
          planned_quantity: row.planned_quantity,
          actual_quantity: row.actual_quantity,
          uom: row.uom,
          station_id: row.station_id,
          station_name: row.station_name,
          labels: []
        }
      }

      if (row.label_id) {
        map[row.material_part_id].labels.push({
          label_id: row.label_id,
          label_number: row.label_number,
          wo_item_label_id: row.wo_item_label_id,
          wo_storing_id: row.wo_storing_id,
          wo_storing_number: row.wo_storing_number
        })
      }

      return map
    }, {})

    return {
      status: true,
      data: Object.values(materialMap)
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