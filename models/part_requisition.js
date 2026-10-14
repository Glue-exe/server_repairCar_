const pool = require('../libs/db_pool');

module.exports = {
    getCompatibleParts: async (subTaskId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const sql = `
                SELECT
                    p.part_id,
                    p.part_code,
                    p.part_name,
                    p.part_price,
                    p.unit,
                    p.part_is_active,
                    p.part_url,
                    p.part_brand_id,
                    p.part_category_id,
                    pb.pb_name,
                    pc.pc_name
                FROM part p
                INNER JOIN part_brand pb ON p.part_brand_id = pb.pb_id
                INNER JOIN part_category pc ON p.part_category_id = pc.pc_id
                CROSS JOIN (
                    SELECT v.v_vehicle_model_id, v.v_year
                    FROM sub_task st
                    JOIN orders o ON st.st_order_id = o.o_id
                    JOIN vehicle v ON o.o_vehicle_id = v.v_id
                    WHERE st.st_id = $1
                ) veh
                WHERE p.part_is_active = TRUE
                  AND (
                      -- Universal Part
                      NOT EXISTS (
                          SELECT 1 FROM vehicle_part_compatibility vpc_u 
                          WHERE vpc_u.vpc_part_id = p.part_id
                      )
                      OR
                      -- Model-Specific Part
                      EXISTS (
                          SELECT 1 FROM vehicle_part_compatibility vpc_m
                          WHERE vpc_m.vpc_part_id = p.part_id
                            AND vpc_m.vpc_vehicle_model_id = veh.v_vehicle_model_id
                            AND (vpc_m.vpc_year_from IS NULL OR veh.v_year >= vpc_m.vpc_year_from)
                            AND (vpc_m.vpc_year_to IS NULL OR veh.v_year <= vpc_m.vpc_year_to)
                      )
                  )
                ORDER BY p.part_id ASC;
            `;

            const rows = await conn.query(sql, [subTaskId]);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }

        return result;
    },

    getRequestPartsBySubTaskId: async (subTaskId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const sql = `
                SELECT 
                    rp.rp_id AS id,
                    rp.rp_id,
                    rp.rp_sub_task_id AS sub_task_id,
                    rp.rp_req_part_status_id AS status_id,
                    rps.rps_name AS status_name,
                    rp.rp_requested_by_account_id AS requested_by_account_id,
                    CONCAT(emp.emp_first_name, ' ', emp.emp_last_name) AS requester_name,
                    rp.rp_requested_at AS requested_at,
                    rp.rp_cancelled_at AS cancelled_at,
                    emp_c.emp_first_name || ' ' || emp_c.emp_last_name AS cancelled_by_name,
                    (rp.rp_requested_by_account_id = $2
                        AND rp.rp_req_part_status_id IN (1, 2)) AS can_cancel,
                    p.part_id,
                    p.part_name,
                    rpi.rpi_price AS part_price,
                    pb.pb_name AS part_brand,
                    rpi.rpi_quantity AS quantity
                FROM request_part rp
                INNER JOIN req_part_status rps ON rp.rp_req_part_status_id = rps.rps_id
                INNER JOIN request_part_item rpi ON rpi.rpi_request_part_id = rp.rp_id
                INNER JOIN part p ON rpi.rpi_part_id = p.part_id
                LEFT JOIN part_brand pb ON p.part_brand_id = pb.pb_id
                LEFT JOIN account acc ON rp.rp_requested_by_account_id = acc.acc_id
                LEFT JOIN employee emp ON acc.acc_employee_id = emp.emp_id
                LEFT JOIN account acc_c ON rp.rp_cancelled_by_account_id = acc_c.acc_id
                LEFT JOIN employee emp_c ON acc_c.acc_employee_id = emp_c.emp_id
                WHERE rp.rp_sub_task_id = $1
                ORDER BY rp.rp_id DESC;
            `;

            const rows = await conn.query(sql, [subTaskId, accountId]);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }

        return result;
    },

    getRequestPartsForApproval: async (statusId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const sql = `
                SELECT 
                    rp.rp_id AS id,
                    rp.rp_req_part_status_id AS status_id,
                    rps.rps_name AS status_name,
                    rp.rp_requested_by_account_id AS requested_by_account_id,
                    CONCAT(emp.emp_first_name, ' ', emp.emp_last_name) AS requester_name,
                    rp.rp_requested_at AS requested_at,
                    o.o_id AS order_id,
                    v.v_license_plate AS license_plate,
                    CONCAT(vb.vb_name, ' ', vm.vm_name) AS vehicle_name,
                    v.v_year AS vehicle_year,
                    v.v_color AS vehicle_color,
                    CONCAT(COALESCE(t.t_name, ''), c.cus_first_name, ' ', c.cus_last_name) AS customer_name,
                    c.cus_phone AS customer_phone,
                    st.st_name AS sub_task_name,
                    p.part_id,
                    p.part_name,
                    p.part_url,
                    pb.pb_name AS part_brand,
                    rpi.rpi_quantity AS quantity,
                    rpi.rpi_price AS price
                FROM request_part rp
                INNER JOIN req_part_status rps ON rp.rp_req_part_status_id = rps.rps_id
                INNER JOIN sub_task st ON rp.rp_sub_task_id = st.st_id
                INNER JOIN orders o ON st.st_order_id = o.o_id
                INNER JOIN vehicle v ON o.o_vehicle_id = v.v_id
                INNER JOIN vehicle_model vm ON v.v_vehicle_model_id = vm.vm_id
                INNER JOIN vehicle_brand vb ON vm.vm_brand_id = vb.vb_id
                INNER JOIN customer c ON v.v_customer_id = c.cus_id
                LEFT JOIN title t ON c.cus_title_id = t.t_id
                INNER JOIN request_part_item rpi ON rpi.rpi_request_part_id = rp.rp_id
                INNER JOIN part p ON rpi.rpi_part_id = p.part_id
                LEFT JOIN part_brand pb ON p.part_brand_id = pb.pb_id
                LEFT JOIN account acc ON rp.rp_requested_by_account_id = acc.acc_id
                LEFT JOIN employee emp ON acc.acc_employee_id = emp.emp_id
                WHERE rp.rp_req_part_status_id = $1
                ORDER BY rp.rp_id DESC, rpi.rpi_id ASC;
            `;
            const rows = await conn.query(sql, [statusId]);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }

        return result;
    },

    getReqPartStatuses: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const sql = `
                SELECT 
                    rps_id AS id,
                    rps_name AS name
                FROM req_part_status
                ORDER BY rps_id ASC;
            `;
            const rows = await conn.query(sql);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: null,
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }

        return result;
    },

    createRequestPart: async (data, accountId) => {
        let conn;
        let result;

        const items = Array.isArray(data.items) ? data.items : [];

        if (items.length === 0) {
            return {
                isError: true,
                data: null,
                errorMessage: "ไม่มีรายการอะไหล่"
            };
        }

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
                accountId
            ]);
            const requestPartId = rpRes.rows[0].rp_id;

            // บันทึกทุกรายการอะไหล่ลงในใบเบิกเดียวกัน
            const rpiSql = `
                INSERT INTO request_part_item (
                    rpi_request_part_id,
                    rpi_part_id,
                    rpi_quantity,
                    rpi_price
                ) VALUES ($1, $2, $3, COALESCE($4, (SELECT part_price FROM part WHERE part_id = $2)));
            `;
            for (const item of items) {
                await conn.query(rpiSql, [
                    requestPartId,
                    item.part_id,
                    item.quantity,
                    item.price
                ]);
            }

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
        }

        return result;
    },

    updateRequestPartStatus: async (requestPartId, statusId, accountId) => {
        let conn;
        let result;

        const status = Number(statusId);
        if (status !== 2 && status !== 3) {
            return {
                isError: true,
                data: null,
                errorMessage: "สถานะไม่ถูกต้อง"
            };
        }

        try {
            conn = await pool.connect();
            await conn.query('BEGIN');

            // check รออนุมัติ 
            const checkSql = `
                SELECT rp_req_part_status_id
                FROM request_part
                WHERE rp_id = $1
                FOR UPDATE;
            `;
            const checkRes = await conn.query(checkSql, [requestPartId]);

            if (checkRes.rows.length === 0) {
                await conn.query('ROLLBACK');
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบใบเบิกที่ระบุ"
                };
            }

            if (checkRes.rows[0].rp_req_part_status_id !== 1) {
                await conn.query('ROLLBACK');
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ใบเบิกนี้ถูกดำเนินการไปแล้ว"
                };
            }

            const sql = `
                UPDATE request_part
                SET rp_req_part_status_id = $1,
                    rp_approved_by_account_id = $2
                WHERE rp_id = $3;
            `;
            await conn.query(sql, [status, accountId, requestPartId]);

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
        }

        return result;
    },

    cancelRequestPart: async (requestPartId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query('BEGIN');

            // ยกเลิกได้เฉพาะใบของตัวเองที่ยังรออนุมัติหรืออนุมัติแล้ว (ปฏิเสธแล้ว/ยกเลิกซ้ำไม่ได้)
            const checkSql = `
                SELECT
                    rp_req_part_status_id,
                    rp_requested_by_account_id
                FROM request_part
                WHERE rp_id = $1
                FOR UPDATE;
            `;
            const checkRes = await conn.query(checkSql, [requestPartId]);

            if (checkRes.rows.length === 0) {
                await conn.query('ROLLBACK');
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบใบเบิกที่ระบุ"
                };
            }

            const requestPart = checkRes.rows[0];

            if (requestPart.rp_requested_by_account_id !== accountId) {
                await conn.query('ROLLBACK');
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณไม่ใช่ผู้ขอเบิก จึงยกเลิกใบนี้ไม่ได้"
                };
            }

            if (requestPart.rp_req_part_status_id !== 1 && requestPart.rp_req_part_status_id !== 2) {
                await conn.query('ROLLBACK');
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ใบเบิกนี้ไม่อยู่ในสถานะที่ยกเลิกได้"
                };
            }

            const sql = `
                UPDATE request_part
                SET rp_req_part_status_id = 4,
                    rp_cancelled_by_account_id = $2,
                    rp_cancelled_at = CURRENT_TIMESTAMP
                WHERE rp_id = $1;
            `;
            await conn.query(sql, [requestPartId, accountId]);

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
        }

        return result;
    }
};
