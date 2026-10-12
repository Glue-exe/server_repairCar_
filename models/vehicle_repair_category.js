const pool = require("../libs/db_pool.js");

module.exports = {
    getRepairCategories: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const sql = `
                SELECT
                    vrc_id AS id,
                    vrc_name AS name,
                    vrc_detail AS detail
                FROM vehicle_repair_category
                WHERE vrc_is_active = TRUE
                ORDER BY vrc_id ASC;
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
    }
};
