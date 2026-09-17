const pool = require('../libs/db_pool');

module.exports = {
    getApprovalPart: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT
                    ap.app_p_id,
                    ap.app_p_request_part_item_id,
                    ap.app_p_account_id,
                    ap.app_p_approval_status_id,
                    ap.app_p_created_at,
                    rpi.rpi_id,
                    rpi.rpi_request_part_id,
                    rpi.rpi_part_id,
                    rpi.rpi_quantity,
                    p.part_name,
                    p.part_price,
                    p.part_brand,
                    p.part_url,
                    st.st_id,
                    st.st_name AS sub_task_name,
                    o.o_id AS order_id,
                    v.v_license_plate,
                    e.emp_first_name,
                    e.emp_last_name
                FROM approval_part AS ap
                INNER JOIN request_part_item AS rpi ON ap.app_p_request_part_item_id = rpi.rpi_id
                INNER JOIN request_part AS rp ON rpi.rpi_request_part_id = rp.rp_id
                INNER JOIN part AS p ON rpi.rpi_part_id = p.part_id
                INNER JOIN sub_task AS st ON rp.rp_sub_task_id = st.st_id
                INNER JOIN orders AS o ON st.st_order_id = o.o_id
                INNER JOIN vehicle AS v ON o.o_vehicle_id = v.v_id
                INNER JOIN account AS acc ON rp.rp_requested_by_account_id = acc.acc_id
                INNER JOIN employee AS e ON acc.acc_employee_id = e.emp_id
                WHERE app_p_approval_status_id = 1;
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
                data: "",
                errorMessage: error.message
            }
            
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    postApprovalPart: async (data) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const sql = `
                UPDATE approval_part
                SET app_p_account_id = $1,
                    app_p_approval_status_id = $2
                WHERE app_p_id = $3
                RETURNING app_p_request_part_item_id;
            `;

            const updateRes = await conn.query(sql, [
                data.account_id,
                data.status_id,
                data.app_p_id
            ]);

            if (updateRes.rows.length > 0) {
                const rpiId = updateRes.rows[0].app_p_request_part_item_id;
                await conn.query(`
                    UPDATE request_part
                    SET rp_req_part_status_id = $1
                    WHERE rp_id = (
                        SELECT rpi_request_part_id 
                        FROM request_part_item 
                        WHERE rpi_id = $2
                    );
                `, [data.status_id, rpiId]);
            }

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