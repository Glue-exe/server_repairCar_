const pool = require('../libs/db_pool');

module.exports = {
    getApprovalPart: async () => {
        let conn;
        try {
            conn = await pool.connect();
            const sql = `
                SELECT 
                    ap.app_p_id AS id,
                    ap.app_p_id,
                    ap.app_p_request_part_item_id AS request_part_item_id,
                    rpi.rpi_part_id AS part_id,
                    p.part_name,
                    p.part_name AS name,
                    p.part_price,
                    p.part_price AS price,
                    p.part_brand,
                    p.part_brand AS brand,
                    rpi.rpi_quantity AS quantity,
                    ap.app_p_account_id AS account_id,
                    CONCAT(e.emp_first_name, ' ', e.emp_last_name) AS approver_name,
                    ap.app_p_approval_status_id AS approval_status_id,
                    ast.app_s_name AS approval_status_name,
                    ap.app_p_created_at AS created_at
                FROM approval_part ap
                LEFT JOIN request_part_item rpi ON ap.app_p_request_part_item_id = rpi.rpi_id
                LEFT JOIN part p ON rpi.rpi_part_id = p.part_id
                LEFT JOIN account a ON ap.app_p_account_id = a.acc_id
                LEFT JOIN employee e ON a.acc_employee_id = e.emp_id
                LEFT JOIN approval_status ast ON ap.app_p_approval_status_id = ast.app_s_id
                ORDER BY ap.app_p_created_at DESC;
            `;
            const { rows } = await conn.query(sql);
            return { isError: false, data: rows, errorMessage: "" };
        } catch (error) {
            return { isError: true, data: [], errorMessage: error.message };
        } finally {
            if (conn) conn.release();
        }
    }
};