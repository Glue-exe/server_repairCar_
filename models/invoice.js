const pool = require("../libs/db_pool");

module.exports = {
  postCreateInvoice: async (data) => {
    let conn;
    let result;

    try {
      conn = await pool.connect();

      const orderId = data.order_id;
      const accId = data.created_by_account_id;

      const whereInvoiceSql = `
                SELECT
                    i_order_id
                FROM invoice
                WHERE i_order_id = $1
            `;

      const whereInvoiceRes = await conn.query(whereInvoiceSql, [orderId]);

      if (whereInvoiceRes.rows.length === 0) {
        // คำนวณค่าแรงรวม
        const laborSql = `
                SELECT COALESCE(SUM(st_labor_cost), 0.00)::FLOAT AS labor_total
                FROM sub_task
                WHERE st_order_id = $1;
            `;

        const laborRes = await conn.query(laborSql, [orderId]);

        const laborTotal = laborRes.rows[0].labor_total;

        // คำนวณค่าอะไหล่รวม
        const partsSql = `
                SELECT COALESCE(SUM(rpi.rpi_quantity * p.part_price), 0.00)::FLOAT AS parts_total
                FROM approval_part ap
                INNER JOIN request_part_item rpi ON ap.app_p_request_part_item_id = rpi.rpi_id
                INNER JOIN part p ON rpi.rpi_part_id = p.part_id
                INNER JOIN request_part rp ON rpi.rpi_request_part_id = rp.rp_id
                INNER JOIN sub_task st ON rp.rp_sub_task_id = st.st_id
                WHERE st.st_order_id = $1 AND ap.app_p_approval_status_id = 2;
            `;

        const partsRes = await conn.query(partsSql, [orderId]);

        const partsTotal = partsRes.rows[0].parts_total;

        // คำนวณยอดรวมทั้งสิ้น
        const total = laborTotal + partsTotal;

        // ตรวจสอบว่ายังมีงานย่อยที่ยังไม่เสร็จหรือไม่
        const checkSql = `
            SELECT COUNT(*) AS pending_count 
            FROM sub_task 
            WHERE st_order_id = $1 AND st_sub_task_status_id != 3;
        `;

        const checkRes = await conn.query(checkSql, [orderId]);

        if (parseInt(checkRes.rows[0].pending_count) > 0) {
            result = {
                isError: true,
                data: null,
                errorMessage: "sub_task not succ",
            };
            return;
        }      

        const insertSql = `
                INSERT INTO invoice
                    (
                        i_order_id,
                        i_parts_total,
                        i_labor_total,
                        i_total,
                        i_payment_method_id,
                        i_payment_status_id,
                        i_paid_at,
                        i_created_by_account_id
                    )
                VALUES
                    (
                        $1, $2, $3, $4, 1, 1, NULL, $5
                    )
                RETURNING *;
            `;

        const insertParams = [orderId, partsTotal, laborTotal, total, accId];

        const insertRes = await conn.query(insertSql, insertParams);

        result = {
            isError: false,
            data: insertRes.rows[0],
            errorMessage: "",
        };
      } else {

        result = {
            isError: true,
            data: null,
            errorMessage: "have data",
        };

      }

    } catch (error) {
      result = {
        isError: true,
        data: [],
        errorMessage: error.message,
      };

    } finally {
      if (conn) 
        conn.release();

      return result;
    }
  },

  getInvoice: async (data) => {
    let conn;
    let result;

    try {
      const orderId = data.order_id;

      conn = await pool.connect();

      const whereSql = `
        SELECT
            i_order_id
        FROM invoice
        WHERE i_order_id = $1
        `;

      const whereRes = await conn.query(whereSql, [orderId]);

      if (whereRes.rows.length === 0) {

        result = {
            isError: false,
            data: null,
            errorMessage: "create invoice first",
        };

      } else {

        // 1. ดึงหัวบิล (Invoice Header)
        const invoiceSql = `
        SELECT
            i.i_id AS invoice_no,
            CONCAT(c.cus_first_name, ' ', c.cus_last_name) AS customer_name,
            c.cus_phone AS customer_phone,
            v.v_license_plate AS license_plate,
            CONCAT(vb.vb_name, ' ', vm.vm_name) AS vehicle_name,
            TO_CHAR(i.i_created_at, 'DD/MM/YYYY HH24:MI น.') AS created_at,
            i.i_labor_total::FLOAT AS labor_total,
            i.i_parts_total::FLOAT AS parts_total,
            i.i_total::FLOAT AS total,
            pm.pm_name AS payment_method,
            ps.ps_name AS payment_status
        FROM invoice i
        INNER JOIN orders o ON i.i_order_id = o.o_id
        INNER JOIN vehicle v ON o.o_vehicle_id = v.v_id
        INNER JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
        INNER JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
        INNER JOIN customer c ON v.v_customer_id = c.cus_id
        INNER JOIN payment_method pm ON i.i_payment_method_id = pm.pm_id
        INNER JOIN payment_status ps ON i.i_payment_status_id = ps.ps_id
        WHERE i.i_order_id = $1;
      `;

        const invoiceRes = await conn.query(invoiceSql, [orderId]);

        // 2. ดึงรายการงานซ่อมย่อยทั้งหมดของ Order นี้
        const subTaskSql = `
        SELECT
            st_id AS id,
            st_name AS name,
            st_labor_cost::FLOAT AS labor_cost
        FROM sub_task
        WHERE st_order_id = $1;
      `;

        const subTaskRes = await conn.query(subTaskSql, [orderId]);

        // 3. ดึงรายการอะไหล่ทั้งหมดที่อนุมัติแล้ว พร้อมระบุว่ามาจาก sub_task_id ไหน
        const partsSql = `
        SELECT
            st.st_id AS sub_task_id,
            p.part_id AS id,
            p.part_name AS name,
            p.part_brand AS brand,
            rpi.rpi_quantity AS quantity,
            p.part_price::FLOAT AS unit_price,
            (rpi.rpi_quantity * p.part_price)::FLOAT AS total_price
        FROM approval_part ap
        INNER JOIN request_part_item rpi ON ap.app_p_request_part_item_id = rpi.rpi_id
        INNER JOIN part p ON rpi.rpi_part_id = p.part_id
        INNER JOIN request_part rp ON rpi.rpi_request_part_id = rp.rp_id
        INNER JOIN sub_task st ON rp.rp_sub_task_id = st.st_id
        WHERE st.st_order_id = $1 AND ap.app_p_approval_status_id = 2;
      `;

        const partsRes = await conn.query(partsSql, [orderId]);

        // 4. นำอะไหล่ไปใส่ไว้ในแต่ละงานซ่อมย่อย (SubTask) ของมัน
        const subTasksWithParts = subTaskRes.rows.map((task) => {
          return {
            id: task.id,
            name: task.name,
            labor_cost: task.labor_cost,
            // ดึงเฉพาะอะไหล่ที่เป็นของงานซ่อมนี้
            parts: partsRes.rows.filter((p) => p.sub_task_id === task.id),
          };
        });

        // 5. รวมใส่หัวบิล
        const invoiceData = invoiceRes.rows[0];
        invoiceData.sub_tasks = subTasksWithParts;

        result = {
          isError: false,
          data: invoiceData,
          errorMessage: "",
        };
      }

    } catch (error) {
        result = {
            isError: true,
            data: [],
            errorMessage: error.message,
        };

    } finally {

      if (conn) 
        conn.release();

      return result;
    }
  },

  updatePaymentMethod: async (data) => {
    let conn;
    let result;

    try {
      conn = await pool.connect();
      
      const orderId = data.order_id;
      const methodId = data.payment_method_id;

      await conn.query(
        `UPDATE invoice SET i_payment_method_id = $1 WHERE i_order_id = $2;`,
        [methodId, orderId]
      );

      result = {
        isError: false,
        data: "ok",
        errorMessage: "",
      };

    } catch (error) {

      result = {
        isError: true,
        data: null,
        errorMessage: error.message,
      };

    } finally {

      if (conn) 
        conn.release();

      return result;
    }
  },

  updatePaymentStatus: async (data) => {
    let conn;
    let result;

    try {
      conn = await pool.connect();
      const orderId = data.order_id;
      const statusId = data.payment_status_id;

      await conn.query(
        `UPDATE invoice 
         SET i_payment_status_id = $1, 
             i_paid_at = CASE WHEN $1 = 2 THEN CURRENT_TIMESTAMP ELSE NULL END 
         WHERE i_order_id = $2;`,
        [statusId, orderId]
      );

      result = {
        isError: false,
        data: "ok",
        errorMessage: "",
      };

    } catch (error) {

      result = {
        isError: true,
        data: null,
        errorMessage: error.message,
      };

    } finally {
        
        if (conn) 
            conn.release();

      return result;
    }
  },
};

