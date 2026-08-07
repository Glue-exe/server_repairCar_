const pool = require('../libs/db_pool');

module.exports = {
    getUserRole: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    user_role_id,
                    user_role_name
                    
                FROM user_role
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