const pool = require('../libs/db_pool');

module.exports = {
    getUserRole: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    account_role_id AS user_role_id,
                    account_role_name AS user_role_name
                FROM account_role
                ORDER BY account_role_id ASC
            `
            var rows = await conn.query(sql);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            }

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