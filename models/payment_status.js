const pool = require('../libs/db_pool');

module.exports = {
    getPaymentStatus: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    ps_id AS id,
                    ps_name AS name
                FROM payment_status
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
