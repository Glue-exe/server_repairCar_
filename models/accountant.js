const pool = require("../libs/db_pool.js");

module.exports = {
  // 1. สรุปภาพรวมยอดเงินสำหรับพนักงานบัญชี
  getSummary: async () => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = `
        SELECT 
            -- ยอดเงินที่รอชำระ (Pending Payment)
            COALESCE((
                SELECT SUM(COALESCE(inv.i_total, calc.est_total, 0))::FLOAT
                FROM orders o
                LEFT JOIN invoice inv ON o.o_id = inv.i_order_id AND inv.i_cancelled_at IS NULL
                LEFT JOIN LATERAL (
                    SELECT 
                        COALESCE(SUM(st.st_labor_cost), 0) + 
                        COALESCE((
                            SELECT SUM(COALESCE(rpi.rpi_price, p.part_price) * rpi.rpi_quantity)
                            FROM request_part rp
                            JOIN request_part_item rpi ON rp.rp_id = rpi.rpi_request_part_id
                            JOIN part p ON rpi.rpi_part_id = p.part_id
                            WHERE rp.rp_sub_task_id IN (SELECT st_id FROM sub_task WHERE st_order_id = o.o_id)
                              AND (rp.rp_req_part_status_id IN (2, 5, 6) OR rp.rp_req_part_status_id IS NULL)
                              AND rp.rp_cancelled_at IS NULL
                        ), 0) AS est_total
                    FROM sub_task st
                    WHERE st.st_order_id = o.o_id
                ) calc ON true
                WHERE o.o_order_status_id = 3
                  AND ((inv.i_payment_status_id = 1 AND inv.i_cancelled_at IS NULL) OR inv.i_id IS NULL)
            ), 0)::FLOAT AS "totalPendingAmount",

            -- จำนวนรายการที่รอชำระ (เฉพาะงานที่ซ่อมเสร็จสิ้นแล้ว o_order_status_id = 3)
            COALESCE((
                SELECT COUNT(DISTINCT o.o_id)::INT
                FROM orders o
                LEFT JOIN invoice inv ON o.o_id = inv.i_order_id AND inv.i_cancelled_at IS NULL
                WHERE o.o_order_status_id = 3
                  AND ((inv.i_payment_status_id = 1 AND inv.i_cancelled_at IS NULL) OR inv.i_id IS NULL)
            ), 0)::INT AS "pendingCount",

            -- ยอดเงินที่ชำระแล้วเดือนนี้ (Paid & Delivered)
            COALESCE((
                SELECT SUM(i_total)::FLOAT
                FROM invoice
                WHERE i_payment_status_id = 2
                  AND i_cancelled_at IS NULL
                  AND i_paid_at IS NOT NULL
                  AND TO_CHAR(i_paid_at, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
            ), 0)::FLOAT AS "totalPaidAmount",

            -- จำนวนรายการที่ชำระแล้วเดือนนี้
            COALESCE((
                SELECT COUNT(*)::INT
                FROM invoice
                WHERE i_payment_status_id = 2
                  AND i_cancelled_at IS NULL
                  AND i_paid_at IS NOT NULL
                  AND TO_CHAR(i_paid_at, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
            ), 0)::INT AS "paidCount";
      `;
      const { rows } = await conn.query(sql);
      return {
        isError: false,
        data: rows[0],
        errorMessage: "",
      };
    } catch (error) {
      console.error("Database Error in getSummary:", error);
      return {
        isError: true,
        data: {
          totalPendingAmount: 0.0,
          pendingCount: 0,
          totalPaidAmount: 0.0,
          paidCount: 0,
        },
        errorMessage: error.message,
      };
    } finally {
      if (conn) conn.release();
    }
  },

  // 2. ดึงรายการงานตามสถานะ: pending (รอชำระ) หรือ paid (ชำระแล้ว)
  getOrders: async ({ type = "pending", search = "" }) => {
    let conn;
    try {
      conn = await pool.connect();

      let conditions = [];
      let params = [];

      if (type === "paid") {
        // ชำระแล้ว
        conditions.push("inv.i_payment_status_id = 2 AND inv.i_cancelled_at IS NULL");
      } else {
        // รอชำระ: เฉพาะงานที่ซ่อมเสร็จสิ้นแล้ว (o_order_status_id = 3) เท่านั้น และยังไม่ชำระเงิน
        conditions.push(
          "o.o_order_status_id = 3 AND ((inv.i_payment_status_id = 1 AND inv.i_cancelled_at IS NULL) OR inv.i_id IS NULL)"
        );
      }

      if (search && search.trim() !== "") {
        params.push(`%${search.trim()}%`);
        const sIdx = `$${params.length}`;
        conditions.push(`(
            v.v_license_plate ILIKE ${sIdx} OR 
            c.cus_first_name ILIKE ${sIdx} OR 
            c.cus_last_name ILIKE ${sIdx} OR 
            c.cus_phone ILIKE ${sIdx} OR 
            vb.vb_name ILIKE ${sIdx} OR 
            vm.vm_name ILIKE ${sIdx}
        )`);
      }

      const whereClause =
        conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

      const sql = `
          SELECT 
              o.o_id AS order_id,
              o.o_symptom AS symptom,
              o.o_created_at AS created_at,
              o.o_order_status_id AS order_status_id,
              os.os_name AS order_status_name,
              p.p_name AS priority_name,
              
              -- ข้อมูลรถ
              v.v_id AS vehicle_id,
              v.v_license_plate AS license_plate,
              v.v_color AS color,
              v.v_year AS year,
              vb.vb_name AS brand_name,
              vm.vm_name AS model_name,
              
              -- ข้อมูลลูกค้า
              c.cus_id AS customer_id,
              c.cus_first_name AS customer_first_name,
              c.cus_last_name AS customer_last_name,
              c.cus_phone AS customer_phone,
              
              -- ข้อมูลใบแจ้งหนี้/การชำระเงิน
              inv.i_id AS invoice_id,
              inv.i_image_url AS invoice_image_url,
              COALESCE(inv.i_labor_total, calc.labor_cost, 0)::FLOAT AS labor_total,
              COALESCE(inv.i_parts_total, calc.parts_cost, 0)::FLOAT AS parts_total,
              COALESCE(inv.i_total, (calc.labor_cost + calc.parts_cost), 0)::FLOAT AS total_amount,
              COALESCE(inv.i_payment_status_id, 1) AS payment_status_id,
              CASE 
                  WHEN inv.i_payment_status_id = 2 THEN 'ชำระแล้ว'
                  ELSE 'รอชำระ'
              END AS payment_status_name,
              inv.i_payment_method_id AS payment_method_id,
              pm.pm_name AS payment_method_name,
              inv.i_paid_at AS paid_at
          FROM orders o
          JOIN vehicle v ON o.o_vehicle_id = v.v_id
          JOIN customer c ON v.v_customer_id = c.cus_id
          LEFT JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
          LEFT JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
          LEFT JOIN order_status os ON o.o_order_status_id = os.os_id
          LEFT JOIN priority p ON o.o_priority_id = p.p_id
          LEFT JOIN invoice inv ON o.o_id = inv.i_order_id AND inv.i_cancelled_at IS NULL
          LEFT JOIN payment_method pm ON inv.i_payment_method_id = pm.pm_id
          LEFT JOIN LATERAL (
              SELECT 
                  COALESCE(SUM(st.st_labor_cost), 0)::FLOAT AS labor_cost,
                  COALESCE((
                      SELECT SUM(COALESCE(rpi.rpi_price, p.part_price) * rpi.rpi_quantity)::FLOAT
                      FROM request_part rp
                      JOIN request_part_item rpi ON rp.rp_id = rpi.rpi_request_part_id
                      JOIN part p ON rpi.rpi_part_id = p.part_id
                      WHERE rp.rp_sub_task_id IN (SELECT st_id FROM sub_task WHERE st_order_id = o.o_id)
                        AND (rp.rp_req_part_status_id IN (2, 5, 6) OR rp.rp_req_part_status_id IS NULL)
                        AND rp.rp_cancelled_at IS NULL
                  ), 0)::FLOAT AS parts_cost
              FROM sub_task st
              WHERE st.st_order_id = o.o_id
          ) calc ON true
          ${whereClause}
          ORDER BY 
              CASE WHEN inv.i_payment_status_id = 2 THEN inv.i_paid_at ELSE o.o_created_at END DESC;
      `;

      const { rows } = await conn.query(sql, params);
      return {
        isError: false,
        data: rows,
        errorMessage: "",
      };
    } catch (error) {
      console.error("Database Error in getOrders:", error);
      return {
        isError: true,
        data: [],
        errorMessage: error.message,
      };
    } finally {
      if (conn) conn.release();
    }
  },

  // 3. บันทึกการรับชำระเงิน (พร้อมบันทึกภาพสลิปหลักฐานการจ่ายเงิน)
  payOrder: async ({
    order_id,
    payment_method_id,
    slip_image_url = null,
    account_id = 1,
  }) => {
    let conn;
    try {
      conn = await pool.connect();
      await conn.query("BEGIN");

      // 0. ตรวจสอบสถานะ Order ต้องเป็น 3 (ซ่อมเสร็จสิ้น) เท่านั้น จึงจะสามารถชำระเงินได้
      const orderCheck = await conn.query(
        "SELECT o_id, o_order_status_id FROM orders WHERE o_id = $1 FOR UPDATE;",
        [order_id]
      );
      if (orderCheck.rows.length === 0) {
        await conn.query("ROLLBACK");
        return {
          isError: true,
          data: null,
          errorMessage: "ไม่พบใบสั่งซ่อมที่ระบุ",
        };
      }
      if (orderCheck.rows[0].o_order_status_id !== 3) {
        await conn.query("ROLLBACK");
        return {
          isError: true,
          data: null,
          errorMessage: "ใบสั่งซ่อมต้องอยู่ในสถานะ 'ซ่อมเสร็จสิ้น' เท่านั้น จึงจะสามารถทำรายการชำระเงินได้",
        };
      }

      // 1. ตรวจสอบว่ามี invoice อยู่แล้วหรือไม่
      const checkInvSql = `SELECT i_id, i_parts_total, i_labor_total, i_total, i_image_url FROM invoice WHERE i_order_id = $1 AND i_cancelled_at IS NULL LIMIT 1;`;
      const checkRes = await conn.query(checkInvSql, [order_id]);

      let invoiceId;
      if (checkRes.rows.length > 0) {
        // มี invoice อยู่แล้ว: ใช้ยอดเดิมจาก snapshot ในตาราง invoice ไม่เขียนทับยอด!
        invoiceId = checkRes.rows[0].i_id;
        const updateInvSql = `
            UPDATE invoice
            SET 
                i_payment_method_id = $1,
                i_payment_status_id = 2,
                i_paid_at = CURRENT_TIMESTAMP,
                i_image_url = COALESCE($2, i_image_url)
            WHERE i_id = $3
            RETURNING *;
        `;
        await conn.query(updateInvSql, [
          payment_method_id,
          slip_image_url,
          invoiceId,
        ]);
      } else {
        // ยังไม่มี invoice: สร้าง snapshot ฝั่งเซิร์ฟเวอร์เหมือน invoice2.js (sub_task สถานะ 3 + request_part_item สถานะ 2)
        const laborRes = await conn.query(
          `
            SELECT COALESCE(SUM(st_labor_cost), 0.00)::FLOAT AS labor_total
            FROM sub_task
            WHERE st_order_id = $1 AND st_sub_task_status_id = 3;
          `,
          [order_id]
        );
        const labor_total = laborRes.rows[0]?.labor_total || 0;

        const partsRes = await conn.query(
          `
            SELECT COALESCE(SUM(rpi.rpi_quantity * rpi.rpi_price), 0.00)::FLOAT AS parts_total
            FROM request_part_item rpi
            INNER JOIN request_part rp ON rpi.rpi_request_part_id = rp.rp_id
            INNER JOIN sub_task st ON rp.rp_sub_task_id = st.st_id
            WHERE st.st_order_id = $1
              AND st.st_sub_task_status_id = 3
              AND rp.rp_req_part_status_id IN (2, 5, 6);
          `,
          [order_id]
        );
        const parts_total = partsRes.rows[0]?.parts_total || 0;
        const total = labor_total + parts_total;

        const insertInvSql = `
            INSERT INTO invoice (
                i_order_id, i_parts_total, i_labor_total, i_total, 
                i_payment_method_id, i_payment_status_id, i_paid_at, i_created_by_account_id, i_image_url
            )
            VALUES ($1, $2, $3, $4, $5, 2, CURRENT_TIMESTAMP, $6, $7)
            RETURNING i_id;
        `;
        const insertRes = await conn.query(insertInvSql, [
          order_id,
          parts_total,
          labor_total,
          total,
          payment_method_id,
          account_id,
          slip_image_url,
        ]);
        invoiceId = insertRes.rows[0].i_id;

        // บันทึก invoice_line รายการค่าแรง
        await conn.query(
          `
            INSERT INTO invoice_line (
                il_invoice_id,
                il_type,
                il_sub_task_id,
                il_name,
                il_quantity,
                il_unit_price,
                il_total
            )
            SELECT $1, 'labor', st_id, st_name, 1, st_labor_cost, st_labor_cost
            FROM sub_task
            WHERE st_order_id = $2 AND st_sub_task_status_id = 3;
          `,
          [invoiceId, order_id]
        );

        // บันทึก invoice_line รายการอะไหล่
        await conn.query(
          `
            INSERT INTO invoice_line (
                il_invoice_id,
                il_type,
                il_sub_task_id,
                il_part_id,
                il_name,
                il_brand,
                il_unit,
                il_quantity,
                il_unit_price,
                il_total
            )
            SELECT
                $1,
                'part',
                st.st_id,
                p.part_id,
                p.part_name,
                pb.pb_name,
                p.unit,
                rpi.rpi_quantity,
                rpi.rpi_price,
                (rpi.rpi_quantity * rpi.rpi_price)
            FROM request_part_item rpi
            INNER JOIN request_part rp ON rpi.rpi_request_part_id = rp.rp_id
            INNER JOIN sub_task st ON rp.rp_sub_task_id = st.st_id
            INNER JOIN part p ON rpi.rpi_part_id = p.part_id
            LEFT JOIN part_brand pb ON p.part_brand_id = pb.pb_id
            WHERE st.st_order_id = $2
                AND st.st_sub_task_status_id = 3
                AND rp.rp_req_part_status_id IN (2, 5, 6);
          `,
          [invoiceId, order_id]
        );
      }

      // 2. อัปเดตสถานะ orders ให้เป็น 4 (ส่งมอบรถคืนเรียบร้อย)
      const updateOrderSql = `
          UPDATE orders 
          SET o_order_status_id = 4, o_updated_at = CURRENT_TIMESTAMP 
          WHERE o_id = $1;
      `;
      await conn.query(updateOrderSql, [order_id]);

      // 3. บันทึก repair_log
      const logNote =
        payment_method_id === 2
          ? "รับชำระเงินผ่านการโอน (แนบสลิปเรียบร้อย) และส่งมอบรถคืน"
          : "รับชำระเงินสดและส่งมอบรถคืนเรียบร้อย";
      const insertLogSql = `
          INSERT INTO repair_log (rl_order_id, rl_order_status_id, rl_note, rl_updated_by_account_id)
          VALUES ($1, 4, $2, $3);
      `;
      await conn.query(insertLogSql, [order_id, logNote, account_id]);

      await conn.query("COMMIT");

      return {
        isError: false,
        data: {
          order_id,
          invoice_id: invoiceId,
          slip_image_url,
          message: "บันทึกการชำระเงินเรียบร้อยแล้ว",
        },
        errorMessage: "",
      };
    } catch (error) {
      if (conn) await conn.query("ROLLBACK");
      console.error("Database Error in payOrder:", error);
      return {
        isError: true,
        errorMessage: "ไม่สามารถบันทึกการชำระเงินได้: " + error.message,
      };
    } finally {
      if (conn) conn.release();
    }
  },

  // 4. ดึงรายการวิธีชำระเงิน
  getPaymentMethods: async () => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = `SELECT pm_id AS id, pm_name AS name FROM payment_method ORDER BY pm_id ASC;`;
      const { rows } = await conn.query(sql);
      return {
        isError: false,
        data: rows,
        errorMessage: "",
      };
    } catch (error) {
      console.error("Database Error in getPaymentMethods:", error);
      return {
        isError: true,
        data: [],
        errorMessage: error.message,
      };
    } finally {
      if (conn) conn.release();
    }
  },

  // 5. ดึงภาพ QR Code ของร้านค้า
  getQrimg: async () => {
    let conn;
    try {
      conn = await pool.connect();
      const sql = `SELECT qr_id, qr_img FROM qr_img_setting LIMIT 1;`;
      const { rows } = await conn.query(sql);
      const qrImage =
        rows.length > 0 && rows[0].qr_img
          ? rows[0].qr_img
          : "";
      return {
        isError: false,
        data: {
          qr_image: qrImage,
          qr_img: qrImage,
        },
        errorMessage: "",
      };
    } catch (error) {
      console.error("Database Error in getQrimg:", error);
      return {
        isError: true,
        data: { qr_image: "", qr_img: "" },
        errorMessage: error.message,
      };
    } finally {
      if (conn) conn.release();
    }
  },

  // Alias สำหรับ getShopQr
  getShopQr: async function () {
    return module.exports.getQrimg();
  },

  // 6. บันทึก / อัปเดตภาพ QR Code ของร้านค้า
  updateQrimg: async (filename) => {
    let conn;
    try {
      conn = await pool.connect();
      const oldRes = await conn.query(
        `SELECT qr_id, qr_img FROM qr_img_setting LIMIT 1;`
      );
      const oldQr =
        oldRes.rows.length > 0 ? oldRes.rows[0].qr_img : null;
      const targetId =
        oldRes.rows.length > 0 ? oldRes.rows[0].qr_id : "shop_qr_code";

      const sql = `
        INSERT INTO qr_img_setting (qr_id, qr_img, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (qr_id) DO UPDATE
        SET qr_img = EXCLUDED.qr_img, updated_at = CURRENT_TIMESTAMP
        RETURNING qr_img;
      `;
      await conn.query(sql, [targetId, filename]);
      return {
        isError: false,
        data: {
          qr_image: filename,
          qr_img: filename,
          old_qr_image: oldQr,
        },
        errorMessage: "",
      };
    } catch (error) {
      console.error("Database Error in updateQrimg:", error);
      return {
        isError: true,
        data: null,
        errorMessage: error.message,
      };
    } finally {
      if (conn) conn.release();
    }
  },

  // Alias สำหรับ updateShopQr
  updateShopQr: async function (filename) {
    return module.exports.updateQrimg(filename);
  },

  // 7. สรุปรายงานรายได้ตามช่วงเวลา แนวโน้ม รายการใบเสร็จรับเงิน และยอดค้างรับ
  getRevenueReport: async ({ startDate, endDate, groupBy = "day", status = "paid" }) => {
    let conn;
    try {
      conn = await pool.connect();

      let dateCondition = "inv.i_payment_status_id = 2 AND inv.i_cancelled_at IS NULL AND inv.i_paid_at IS NOT NULL";
      let params = [];

      if (startDate) {
        params.push(`${startDate} 00:00:00`);
        dateCondition += ` AND inv.i_paid_at >= $${params.length}`;
      }
      if (endDate) {
        params.push(`${endDate} 23:59:59`);
        dateCondition += ` AND inv.i_paid_at <= $${params.length}`;
      }

      // 1. สรุปภาพรวมยอดเงินที่ชำระแล้วตามช่วงเวลา
      const summarySql = `
        SELECT 
            COALESCE(SUM(inv.i_total), 0)::FLOAT AS total_paid_amount,
            COUNT(inv.i_id)::INT AS paid_count,
            COALESCE(SUM(inv.i_labor_total), 0)::FLOAT AS total_labor_amount,
            COALESCE(SUM(inv.i_parts_total), 0)::FLOAT AS total_parts_amount,
            COALESCE(SUM(CASE WHEN inv.i_payment_method_id = 1 THEN inv.i_total ELSE 0 END), 0)::FLOAT AS cash_total_amount,
            COALESCE(COUNT(CASE WHEN inv.i_payment_method_id = 1 THEN 1 END), 0)::INT AS cash_count,
            COALESCE(SUM(CASE WHEN inv.i_payment_method_id = 2 THEN inv.i_total ELSE 0 END), 0)::FLOAT AS transfer_total_amount,
            COALESCE(COUNT(CASE WHEN inv.i_payment_method_id = 2 THEN 1 END), 0)::INT AS transfer_count
        FROM invoice inv
        WHERE ${dateCondition};
      `;
      const summaryRes = await conn.query(summarySql, params);

      // 1.1 สรุปยอดค้างชำระ / ลูกหนี้การค้ารอเก็บเงิน (Pending Receivables)
      const pendingSql = `
        SELECT 
            COALESCE(SUM(
                COALESCE(inv.i_total, (calc.labor_cost + calc.parts_cost), 0)
            ), 0)::FLOAT AS total_pending_amount,
            COALESCE(COUNT(DISTINCT o.o_id), 0)::INT AS pending_count
        FROM orders o
        LEFT JOIN invoice inv ON o.o_id = inv.i_order_id AND inv.i_cancelled_at IS NULL
        LEFT JOIN LATERAL (
            SELECT 
                COALESCE(SUM(st.st_labor_cost), 0)::FLOAT AS labor_cost,
                COALESCE((
                    SELECT SUM(COALESCE(rpi.rpi_price, p.part_price) * rpi.rpi_quantity)
                    FROM request_part rp
                    JOIN request_part_item rpi ON rp.rp_id = rpi.rpi_request_part_id
                    JOIN part p ON rpi.rpi_part_id = p.part_id
                    WHERE rp.rp_sub_task_id IN (SELECT st_id FROM sub_task WHERE st_order_id = o.o_id)
                      AND (rp.rp_req_part_status_id IN (2, 5, 6) OR rp.rp_req_part_status_id IS NULL)
                      AND rp.rp_cancelled_at IS NULL
                ), 0)::FLOAT AS parts_cost
            FROM sub_task st
            WHERE st.st_order_id = o.o_id
        ) calc ON true
        WHERE o.o_order_status_id = 3
          AND ((inv.i_payment_status_id = 1 AND inv.i_cancelled_at IS NULL) OR inv.i_id IS NULL);
      `;
      const pendingRes = await conn.query(pendingSql);
      const pendingRow = pendingRes.rows[0] || { total_pending_amount: 0, pending_count: 0 };

      const mergedSummary = {
        ...(summaryRes.rows[0] || {}),
        total_pending_amount: pendingRow.total_pending_amount || 0,
        pending_count: pendingRow.pending_count || 0,
      };

      // 2. ข้อมูลแนวโน้มรายได้ (Trends for Chart)
      const timeFormat = groupBy === "month" ? "YYYY-MM" : "YYYY-MM-DD";
      const trendsSql = `
        SELECT 
            TO_CHAR(inv.i_paid_at, '${timeFormat}') AS time_bucket,
            COALESCE(SUM(inv.i_total), 0)::FLOAT AS total_amount,
            COALESCE(SUM(inv.i_labor_total), 0)::FLOAT AS labor_amount,
            COALESCE(SUM(inv.i_parts_total), 0)::FLOAT AS parts_amount,
            COUNT(inv.i_id)::INT AS count
        FROM invoice inv
        WHERE ${dateCondition}
        GROUP BY TO_CHAR(inv.i_paid_at, '${timeFormat}')
        ORDER BY time_bucket ASC;
      `;
      const trendsRes = await conn.query(trendsSql, params);

      // 3. รายการบิล: ชำระแล้ว (paid) หรือ รอชำระ (pending)
      let transactionsSql = "";
      let transParams = [];

      if (status === "pending") {
        transactionsSql = `
          SELECT 
              COALESCE(inv.i_id, 0) AS invoice_id,
              o.o_id AS order_id,
              COALESCE(inv.i_created_at, o.o_created_at)::text AS paid_at,
              COALESCE(inv.i_total, (calc.labor_cost + calc.parts_cost), 0)::FLOAT AS total_amount,
              COALESCE(inv.i_labor_total, calc.labor_cost, 0)::FLOAT AS labor_total,
              COALESCE(inv.i_parts_total, calc.parts_cost, 0)::FLOAT AS parts_total,
              COALESCE(inv.i_payment_method_id, 0) AS payment_method_id,
              COALESCE(pm.pm_name, 'รอระบุ') AS payment_method_name,
              inv.i_image_url AS invoice_image_url,
              v.v_license_plate AS license_plate,
              vb.vb_name AS brand_name,
              vm.vm_name AS model_name,
              CONCAT(c.cus_first_name, ' ', c.cus_last_name) AS customer_name,
              c.cus_phone AS customer_phone,
              COALESCE(inv.i_payment_status_id, 1) AS payment_status_id,
              'รอชำระ' AS payment_status_name
          FROM orders o
          JOIN vehicle v ON o.o_vehicle_id = v.v_id
          JOIN customer c ON v.v_customer_id = c.cus_id
          LEFT JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
          LEFT JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
          LEFT JOIN invoice inv ON o.o_id = inv.i_order_id AND inv.i_cancelled_at IS NULL
          LEFT JOIN payment_method pm ON inv.i_payment_method_id = pm.pm_id
          LEFT JOIN LATERAL (
              SELECT 
                  COALESCE(SUM(st.st_labor_cost), 0)::FLOAT AS labor_cost,
                  COALESCE((
                      SELECT SUM(COALESCE(rpi.rpi_price, p.part_price) * rpi.rpi_quantity)
                      FROM request_part rp
                      JOIN request_part_item rpi ON rp.rp_id = rpi.rpi_request_part_id
                      JOIN part p ON rpi.rpi_part_id = p.part_id
                      WHERE rp.rp_sub_task_id IN (SELECT st_id FROM sub_task WHERE st_order_id = o.o_id)
                        AND (rp.rp_req_part_status_id IN (2, 5, 6) OR rp.rp_req_part_status_id IS NULL)
                        AND rp.rp_cancelled_at IS NULL
                  ), 0)::FLOAT AS parts_cost
              FROM sub_task st
              WHERE st.st_order_id = o.o_id
          ) calc ON true
          WHERE o.o_order_status_id = 3
            AND ((inv.i_payment_status_id = 1 AND inv.i_cancelled_at IS NULL) OR inv.i_id IS NULL)
          ORDER BY o.o_created_at DESC;
        `;
      } else {
        transactionsSql = `
          SELECT 
              inv.i_id AS invoice_id,
              inv.i_order_id AS order_id,
              inv.i_paid_at::text AS paid_at,
              inv.i_total::FLOAT AS total_amount,
              inv.i_labor_total::FLOAT AS labor_total,
              inv.i_parts_total::FLOAT AS parts_total,
              inv.i_payment_method_id AS payment_method_id,
              COALESCE(pm.pm_name, 'ไม่ระบุ') AS payment_method_name,
              inv.i_image_url AS invoice_image_url,
              v.v_license_plate AS license_plate,
              vb.vb_name AS brand_name,
              vm.vm_name AS model_name,
              CONCAT(c.cus_first_name, ' ', c.cus_last_name) AS customer_name,
              c.cus_phone AS customer_phone,
              2 AS payment_status_id,
              'ชำระแล้ว' AS payment_status_name
          FROM invoice inv
          JOIN orders o ON inv.i_order_id = o.o_id
          JOIN vehicle v ON o.o_vehicle_id = v.v_id
          JOIN customer c ON v.v_customer_id = c.cus_id
          LEFT JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
          LEFT JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
          LEFT JOIN payment_method pm ON inv.i_payment_method_id = pm.pm_id
          WHERE ${dateCondition}
          ORDER BY inv.i_paid_at DESC;
        `;
        transParams = params;
      }

      const transRes = await conn.query(transactionsSql, transParams);

      return {
        isError: false,
        data: {
          summary: mergedSummary,
          trends: trendsRes.rows || [],
          transactions: transRes.rows || [],
        },
        errorMessage: "",
      };
    } catch (error) {
      console.error("Database Error in getRevenueReport:", error);
      return {
        isError: true,
        data: null,
        errorMessage: error.message,
      };
    } finally {
      if (conn) conn.release();
    }
  },
};
