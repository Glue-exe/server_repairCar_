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

            var sql = `
                SELECT 
                    st.st_id AS id,
                    st.st_order_id AS order_id,
                    st.st_service_id AS service_id,
                    st.st_name AS name,
                    st.st_labor_cost AS labor_cost,
                    st.st_sub_task_status_id AS status_id,
                    sts.sts_name AS status_name,
                    COALESCE(ot.ot_account_id, 0) AS technician_account_id,
                    COALESCE(emp.emp_first_name, '') AS technician_first_name,
                    COALESCE(emp.emp_last_name, '') AS technician_last_name
                FROM sub_task st
                INNER JOIN sub_task_status sts ON st.st_sub_task_status_id = sts.sts_id
                LEFT JOIN sub_task_technician stt ON st.st_id = stt.stt_sub_task_id
                LEFT JOIN order_technician ot ON stt.stt_order_technician_id = ot.ot_id
                LEFT JOIN account acc ON ot.ot_account_id = acc.acc_id
                LEFT JOIN employee emp ON acc.acc_employee_id = emp.emp_id
                WHERE st.st_order_id = $1
                ORDER BY st.st_id ASC;
            `;

            var rows = await conn.query(sql, [orderId]);

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

            await conn.query(
                "INSERT INTO sub_task_technician (stt_sub_task_id, stt_order_technician_id) VALUES ($1, $2)",
                [subTaskId, otId]
            );

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
    }
};
