const pool = require("../libs/db_pool.js");

module.exports = {
    getPriority: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const sql = `
                SELECT
                    p_id AS id,
                    p_name AS name
                FROM priority
                ORDER BY p_id ASC;
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
