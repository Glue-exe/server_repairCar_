const pool = require('../libs/db_pool');

module.exports = {
    getTitle: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    t_id,
                    t_name,
                    t_id AS id,
                    t_name AS name,
                    t_id AS title_id,
                    t_name AS title_name
                FROM title
                ORDER BY t_id ASC
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
    }
}