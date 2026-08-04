const pool = require('../libs/db_pool');

module.exports = {
    getEmployee: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    e.emp_id,
                    e.title_id,
                    t.title_name,
                    e.emp_firstname,
                    e.emp_lastname,
                    CONCAT(t.title_name, e.emp_firstname, ' ', e.emp_lastname) AS emp_fullname,
                    e.emp_phone,
                    e.user_role_id,
                    r.user_role_name,
                    e.emp_salary,
                    e.emp_active
                FROM public.employee e
                LEFT JOIN public.title t ON e.title_id = t.title_id
                LEFT JOIN public.user_role r ON e.user_role_id = r.user_role_id
                ORDER BY e.emp_id ASC;
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