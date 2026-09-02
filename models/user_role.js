const pool = require('../libs/db_pool');

module.exports = {
    getUserRole: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    ar_id,
                    ar_name,
                    ar_id AS id,
                    ar_name AS name,
                    ar_id AS user_role_id,
                    ar_name AS user_role_name
                FROM account_role
                ORDER BY ar_id ASC
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