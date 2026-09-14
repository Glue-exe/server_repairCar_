const pool = require('../libs/db_pool');

module.exports = {
    // ดึงอะไหล่ที่รองรับกับรุ่นรถของงานย่อยนี้ 
    getCompatibleParts: async (subTaskId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT DISTINCT
                    p.part_id,
                    p.part_name,
                    p.part_price,
                    p.part_brand
                FROM part p
                INNER JOIN vehicle_part_compatibility vpc ON p.part_id = vpc.vpc_part_id
                INNER JOIN vehicle v ON vpc.vpc_vehicle_model_id = v.v_vehicle_model_id
                INNER JOIN orders o ON o.o_vehicle_id = v.v_id
                INNER JOIN sub_task st ON st.st_order_id = o.o_id
                WHERE st.st_id = $1
                ORDER BY p.part_id ASC;
            `;

            var rows = await conn.query(sql, [subTaskId]);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: [],
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    // ดึงประวัติใบเบิกอะไหล่ของงานย่อยนี้
    getRequestPartsBySubTaskId: async (subTaskId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    rp.rp_id AS id,
                    rp.rp_id,
                    rp.rp_sub_task_id AS sub_task_id,
                    rp.rp_req_part_status_id AS status_id,
                    rps.rps_name AS status_name,
                    rp.rp_requested_by_account_id AS requested_by_account_id,
                    CONCAT(emp.emp_first_name, ' ', emp.emp_last_name) AS requester_name,
                    rp.rp_requested_at AS requested_at,
                    p.part_id,
                    p.part_name,
                    p.part_price,
                    p.part_brand,
                    rpi.rpi_quantity AS quantity
                FROM request_part rp
                INNER JOIN req_part_status rps ON rp.rp_req_part_status_id = rps.rps_id
                INNER JOIN request_part_item rpi ON rpi.rpi_request_part_id = rp.rp_id
                INNER JOIN part p ON rpi.rpi_part_id = p.part_id
                LEFT JOIN account acc ON rp.rp_requested_by_account_id = acc.acc_id
                LEFT JOIN employee emp ON acc.acc_employee_id = emp.emp_id
                WHERE rp.rp_sub_task_id = $1
                ORDER BY rp.rp_id DESC;
            `;

            var rows = await conn.query(sql, [subTaskId]);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: [],
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    // สร้างใบสั่งเบิกอะไหล่
    createRequestPart: async (data) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query('BEGIN');

            // บันทึกหัวใบเบิก request_part
            const rpSql = `
                INSERT INTO request_part (
                    rp_sub_task_id,
                    rp_req_part_status_id,
                    rp_requested_by_account_id
                ) VALUES ($1, $2, $3)
                RETURNING rp_id;
            `;
            const rpRes = await conn.query(rpSql, [
                data.sub_task_id,
                1,
                data.account_id
            ]);
            const requestPartId = rpRes.rows[0].rp_id;

            // บันทึกรายการอะไหล่ request_part_item
            const rpiSql = `
                INSERT INTO request_part_item (
                    rpi_request_part_id,
                    rpi_part_id,
                    rpi_quantity
                ) VALUES ($1, $2, $3)
                RETURNING rpi_id;
            `;
            const rpiRes = await conn.query(rpiSql, [
                requestPartId,
                data.part_id,
                data.quantity
            ]);
            const rpiId = rpiRes.rows[0].rpi_id;

            // สร้างรายการใน approval_part เพื่อรอให้อนุมัติ
            const appSql = `
                INSERT INTO approval_part (
                    app_p_request_part_item_id,
                    app_p_account_id,
                    app_p_approval_status_id
                ) VALUES ($1, NULL, 1);
            `;
            await conn.query(appSql, [rpiId]);

            await conn.query('COMMIT');

            result = {
                isError: false,
                data: "สำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            if (conn) await conn.query('ROLLBACK');
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    }
};
