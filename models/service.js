const pool = require('../libs/db_pool');

module.exports = {
    getServices: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    s_id AS id,
                    s_name AS name,
                    s_detail AS detail,
                    s_labor_cost AS labor_cost,
                    s_service_url AS service_url
                FROM service
                ORDER BY s_id ASC;
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
    }
};
