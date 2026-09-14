const pool = require('../libs/db_pool');

module.exports = {
    getSubTaskStatuses: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    sts_id AS id,
                    sts_name AS name
                FROM sub_task_status
                ORDER BY sts_id ASC;
            `;

            var rows = await conn.query(sql);

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

    addSubTask: async (data) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                INSERT INTO sub_task (
                    st_order_id,
                    st_service_id,
                    st_name,
                    st_labor_cost,
                    st_sub_task_status_id
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING st_id AS id;
            `;

            await conn.query(sql, [
                data.st_order_id,
                data.st_service_id,
                data.st_name,
                data.st_labor_cost,
                data.st_sub_task_status_id
            ]);

            result = {
                isError: false,
                data: "สำเร็จ",
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

            return result;
        }
    },

    getSubTasksByOrderId: async (orderId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            // 1. ดึงรายการงานย่อยทั้งหมด
            var subTaskSql = `
                SELECT 
                    st.st_id AS id,
                    st.st_order_id AS order_id,
                    st.st_service_id AS service_id,
                    st.st_name AS name,
                    st.st_labor_cost AS labor_cost,
                    st.st_sub_task_status_id AS status_id,
                    sts.sts_name AS status_name
                FROM sub_task st
                INNER JOIN sub_task_status sts ON st.st_sub_task_status_id = sts.sts_id
                WHERE st.st_order_id = $1
                ORDER BY st.st_id ASC;
            `;
            var subTasks = await conn.query(subTaskSql, [orderId]);

            // 2. ดึงช่างที่รับผิดชอบงานย่อยใน order นี้
            var techSql = `
                SELECT 
                    stt.stt_sub_task_id AS sub_task_id,
                    acc.acc_id AS account_id,
                    emp.emp_first_name AS firstname,
                    emp.emp_last_name AS lastname,
                    COALESCE(ar.ar_name, '') AS role_name
                FROM sub_task_technician stt
                INNER JOIN order_technician ot ON stt.stt_order_technician_id = ot.ot_id
                INNER JOIN account acc ON ot.ot_account_id = acc.acc_id
                LEFT JOIN account_role ar ON acc.acc_role_id = ar.ar_id
                INNER JOIN employee emp ON acc.acc_employee_id = emp.emp_id
                WHERE ot.ot_order_id = $1;
            `;
            var techRows = await conn.query(techSql, [orderId]);

            // 3. ผูกข้อมูลช่างใส่งานย่อยแต่ละรายการ
            for (let task of subTasks.rows) {
                task.technicians = techRows.rows.filter(t => t.sub_task_id === task.id);
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

            return result;
        }
    },

    acceptSubTask: async (subTaskId, orderId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            let otRes = await conn.query(
                "SELECT ot_id FROM order_technician WHERE ot_order_id = $1 AND ot_account_id = $2",
                [orderId, accountId]
            );
            let otId;
            if (otRes.rows.length === 0) {
                const newOt = await conn.query(
                    "INSERT INTO order_technician (ot_order_id, ot_account_id) VALUES ($1, $2) RETURNING ot_id",
                    [orderId, accountId]
                );
                otId = newOt.rows[0].ot_id;
            } else {
                otId = otRes.rows[0].ot_id;
            }

            const existingStt = await conn.query(
                "SELECT stt_id FROM sub_task_technician WHERE stt_sub_task_id = $1 AND stt_order_technician_id = $2",
                [subTaskId, otId]
            );
            if (existingStt.rows.length === 0) {
                await conn.query(
                    "INSERT INTO sub_task_technician (stt_sub_task_id, stt_order_technician_id) VALUES ($1, $2)",
                    [subTaskId, otId]
                );
            }

            result = {
                isError: false,
                data: "รับงานสำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    cancelSubTask: async (subTaskId, orderId, accountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            let otRes = await conn.query(
                "SELECT ot_id FROM order_technician WHERE ot_order_id = $1 AND ot_account_id = $2",
                [orderId, accountId]
            );

            if (otRes.rows.length > 0) {
                const otId = otRes.rows[0].ot_id;
                await conn.query(
                    "DELETE FROM sub_task_technician WHERE stt_sub_task_id = $1 AND stt_order_technician_id = $2",
                    [subTaskId, otId]
                );
            }

            result = {
                isError: false,
                data: "ยกเลิกสำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    updateSubTaskStatus: async (subTaskId, statusId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                UPDATE sub_task 
                SET st_sub_task_status_id = $1 
                WHERE st_id = $2;
            `;

            await conn.query(sql, [statusId, subTaskId]);

            result = {
                isError: false,
                data: "สำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            };
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    }
};
