const pool = require('../libs/db_pool');

module.exports = {
    getPaymentMethod: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    pm_id AS id,
                    pm_name AS name
                FROM payment_method
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
