const pool = require('../libs/db_pool');

module.exports = {
    getTitle: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    title_id,
                    title_name
                    
                FROM title
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