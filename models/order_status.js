const pool = require("../libs/db_pool.js");

module.exports = {
    getOrderStatus: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const sql = `
                SELECT
                    os_id AS id,
                    os_name AS name
                FROM order_status
                ORDER BY os_id ASC;
            `;
            const rows = await conn.query(sql);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: "",
            };
        } catch (error) {
            result = {
                isError: true,
                data: [],
                errorMessage: error.message,
            };
        } finally {
            if (conn) conn.release();
        }

        return result;
    },
};
