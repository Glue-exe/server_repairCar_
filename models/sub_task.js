const pool = require("../libs/db_pool.js");

module.exports = {
    getSubTaskStatuses: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const sql = `
                SELECT 
                    sts_id AS id,
                    sts_name AS name
                FROM sub_task_status
                ORDER BY sts_id ASC;
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
                data: [],
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();
        }

        return result;
    },

    addSubTask: async (data, accountId) => {
        let conn;
        let result;

        const orderId = data.st_order_id;

        if (!accountId) {
            return {
                isError: true,
                data: null,
                errorMessage: "ไม่พบข้อมูลผู้ใช้งาน"
            };
        }

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const checkSql = `
                SELECT ot_id
                FROM order_technician
                WHERE ot_order_id = $1 AND ot_account_id = $2;
            `;
            const member = await conn.query(checkSql, [orderId, accountId]);

            if (member.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้"
                };
            }

            const hasService = data.st_service_id != null;
            const hasRepairCategory = data.st_repair_category_id != null;

            if (hasService === hasRepairCategory) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ต้องเลือกบริการหรือหมวดซ่อมอย่างใดอย่างหนึ่ง"
                };
            }

            const sql = `
                INSERT INTO sub_task (
                    st_order_id,
                    st_service_id,
                    st_repair_category_id,
                    st_name,
                    st_labor_cost,
                    st_sub_task_status_id
                ) VALUES ($1, $2, $3, $4, $5, 1);
            `;
            await conn.query(sql, [
                orderId,
                data.st_service_id ?? null,
                data.st_repair_category_id ?? null,
                data.st_name,
                data.st_labor_cost
            ]);

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: "สำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            if (conn)
                await conn.query("ROLLBACK");

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

    getSubTasksByOrderId: async (orderId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const subTaskSql = `
                SELECT 
                    st.st_id AS id,
                    st.st_order_id AS order_id,
                    st.st_service_id AS service_id,
                    st.st_repair_category_id AS repair_category_id,
                    vrc.vrc_name AS repair_category_name,
                    st.st_name AS name,
                    st.st_labor_cost AS labor_cost,
                    st.st_sub_task_status_id AS status_id,
                    sts.sts_name AS status_name,
                    (stt_me.stt_id IS NOT NULL) AS accept_by_me
                FROM sub_task st
                INNER JOIN sub_task_status sts ON st.st_sub_task_status_id = sts.sts_id
                LEFT JOIN vehicle_repair_category vrc ON st.st_repair_category_id = vrc.vrc_id
                LEFT JOIN order_technician ot_me
                    ON ot_me.ot_order_id = st.st_order_id
                    AND ot_me.ot_account_id = $2
                LEFT JOIN sub_task_technician stt_me
                    ON stt_me.stt_sub_task_id = st.st_id
                    AND stt_me.stt_order_technician_id = ot_me.ot_id
                WHERE st.st_order_id = $1
                ORDER BY st.st_id ASC;
            `;
            const subTasks = await conn.query(subTaskSql, [orderId, accountId]);

            const techSql = `
                SELECT 
                    stt.stt_sub_task_id AS sub_task_id,
                    acc.acc_id AS account_id,
                    COALESCE(emp.emp_first_name, '') AS firstname,
                    COALESCE(emp.emp_last_name, '') AS lastname,
                    COALESCE(ar.ar_name, '') AS role_name
                FROM sub_task_technician stt
                INNER JOIN order_technician ot ON stt.stt_order_technician_id = ot.ot_id
                INNER JOIN account acc ON ot.ot_account_id = acc.acc_id
                LEFT JOIN account_role ar ON acc.acc_role_id = ar.ar_id
                LEFT JOIN employee emp ON acc.acc_employee_id = emp.emp_id
                WHERE ot.ot_order_id = $1;
            `;
            const techRows = await conn.query(techSql, [orderId]);

            for (const task of subTasks.rows) {
                task.technicians = techRows.rows.filter(
                    (t) => t.sub_task_id === task.id
                );
            }

            result = {
                isError: false,
                data: subTasks.rows,
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
        }

        return result;
    },

    acceptSubTask: async (subTaskId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            // หา Order เจ้าของงานย่อย
            const subTaskSql = `
                SELECT st_order_id
                FROM sub_task
                WHERE st_id = $1;
            `;
            const subTaskRes = await conn.query(subTaskSql, [subTaskId]);

            if (subTaskRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบงานซ่อมย่อยที่ระบุ"
                };
            }
            const orderId = subTaskRes.rows[0].st_order_id;

            // ต้องกดรับ Order หลักก่อน จึงจะรับงานย่อยได้
            const otSql = `
                SELECT ot_id
                FROM order_technician
                WHERE ot_order_id = $1 AND ot_account_id = $2;
            `;
            const otRes = await conn.query(otSql, [orderId, accountId]);

            if (otRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้"
                };
            }
            const otId = otRes.rows[0].ot_id;

            const checkSttSql = `
                SELECT stt_id
                FROM sub_task_technician
                WHERE stt_sub_task_id = $1 AND stt_order_technician_id = $2;
            `;
            const exist = await conn.query(checkSttSql, [subTaskId, otId]);

            if (exist.rows.length > 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณได้รับงานซ่อมย่อยนี้ไปแล้ว"
                };
            }

            const insertSttSql = `
                INSERT INTO sub_task_technician (
                    stt_sub_task_id,
                    stt_order_technician_id,
                    stt_assigned_at
                ) VALUES ($1, $2, CURRENT_TIMESTAMP);
            `;
            await conn.query(insertSttSql, [subTaskId, otId]);

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: "สำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            if (conn)
                await conn.query("ROLLBACK");

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

    cancelSubTask: async (subTaskId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            // หา Order เจ้าของงานย่อย
            const subTaskSql = `
                SELECT st_order_id
                FROM sub_task
                WHERE st_id = $1;
            `;
            const subTaskRes = await conn.query(subTaskSql, [subTaskId]);

            if (subTaskRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบงานซ่อมย่อยที่ระบุ"
                };
            }
            const orderId = subTaskRes.rows[0].st_order_id;

            const otSql = `
                SELECT ot_id
                FROM order_technician
                WHERE ot_order_id = $1 AND ot_account_id = $2;
            `;
            const otRes = await conn.query(otSql, [orderId, accountId]);

            if (otRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้"
                };
            }
            const otId = otRes.rows[0].ot_id;

            const delSql = `
                DELETE FROM sub_task_technician
                WHERE stt_sub_task_id = $1 AND stt_order_technician_id = $2;
            `;
            await conn.query(delSql, [subTaskId, otId]);

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: "สำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            if (conn)
                await conn.query("ROLLBACK");

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

    deleteSubTask: async (subTaskId, accountId) => {
        let conn;
        let result;

        if (!accountId) {
            return {
                isError: true,
                data: null,
                errorMessage: "ไม่พบข้อมูลผู้ใช้งาน"
            };
        }

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const subTaskSql = `
                SELECT st_order_id, st_sub_task_status_id
                FROM sub_task
                WHERE st_id = $1;
            `;
            const subTaskRes = await conn.query(subTaskSql, [subTaskId]);

            if (subTaskRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบงานซ่อมย่อยที่ระบุ"
                };
            }
            const orderId = subTaskRes.rows[0].st_order_id;
            const statusId = subTaskRes.rows[0].st_sub_task_status_id;

            const otSql = `
                SELECT ot_id
                FROM order_technician
                WHERE ot_order_id = $1 AND ot_account_id = $2;
            `;
            const otRes = await conn.query(otSql, [orderId, accountId]);

            if (otRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานนี้"
                };
            }
            const otId = otRes.rows[0].ot_id;

            const sttSql = `
                SELECT stt_id
                FROM sub_task_technician
                WHERE stt_sub_task_id = $1 AND stt_order_technician_id = $2;
            `;
            const sttRes = await conn.query(sttSql, [subTaskId, otId]);

            if (sttRes.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานซ่อมย่อยนี้"
                };
            }

            if (statusId !== 1) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ลบได้เฉพาะงานซ่อมย่อยที่ยังรอดำเนินการ"
                };
            }

            const partSql = `
                SELECT rp_id
                FROM request_part
                WHERE rp_sub_task_id = $1
                LIMIT 1;
            `;
            const partRes = await conn.query(partSql, [subTaskId]);

            if (partRes.rows.length > 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ลบไม่ได้ เนื่องจากงานซ่อมย่อยนี้มีใบเบิกอะไหล่แล้ว"
                };
            }

            const delSql = `
                DELETE FROM sub_task
                WHERE st_id = $1
                RETURNING st_id;
            `;
            const deleted = await conn.query(delSql, [subTaskId]);

            if (deleted.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบงานซ่อมย่อยที่ระบุ"
                };
            }

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: "สำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            if (conn)
                await conn.query("ROLLBACK");

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

    updateSubTaskStatus: async (subTaskId, statusId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query("BEGIN");

            const checkSql = `
                SELECT st.st_order_id
                FROM sub_task_technician stt
                INNER JOIN order_technician ot ON stt.stt_order_technician_id = ot.ot_id
                INNER JOIN sub_task st ON st.st_id = stt.stt_sub_task_id
                WHERE stt.stt_sub_task_id = $1 AND ot.ot_account_id = $2;
            `;
            const member = await conn.query(checkSql, [subTaskId, accountId]);

            if (member.rows.length === 0) {
                await conn.query("ROLLBACK");
                return {
                    isError: true,
                    data: null,
                    errorMessage: "คุณยังไม่ได้กดรับงานซ่อมย่อยนี้"
                };
            }
            const orderId = member.rows[0].st_order_id;

            const sql = `
                UPDATE sub_task
                SET st_sub_task_status_id = $1,
                    st_updated_at = CURRENT_TIMESTAMP
                WHERE st_id = $2;
            `;
            await conn.query(sql, [statusId, subTaskId]);

            if (statusId === 2) {
                const orderSql = `
                    UPDATE orders
                    SET o_order_status_id = 2,
                        o_updated_at = CURRENT_TIMESTAMP
                    WHERE o_id = $1 AND o_order_status_id = 1;
                `;
                await conn.query(orderSql, [orderId]);
            }

            await conn.query("COMMIT");

            result = {
                isError: false,
                data: "สำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            if (conn)
                await conn.query("ROLLBACK");

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
