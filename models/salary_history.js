const pool = require('../libs/db_pool');

module.exports = {
    getSalaryHistory: async () => {
        let conn;
        let result;

        try {

            conn = await pool.connect();

            const selectSql = `
                SELECT
                    sh.sh_id,
                    sh.sh_emp_id,
                    sh.sh_salary_amount,
                    sh.sh_effective_date,
                    sh.sh_created_at,
                    e.emp_first_name,
                    e.emp_last_name,
                    e.emp_current_salary,
                    t.t_name,
                    a.acc_role_id,
                    r.ar_name
                FROM salary_history sh
                INNER JOIN employee e ON sh.sh_emp_id = e.emp_id
                INNER JOIN title t ON e.emp_title_id = t.t_id
                INNER JOIN account a ON e.emp_id = a.acc_employee_id
                INNER JOIN account_role r ON a.acc_role_id = r.ar_id
                ORDER BY sh.sh_id ASC
            `;

            const rows = await conn.query(selectSql);

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
            if (conn) {
                conn.release();
            }

            return result;
        }
    },

    putUpdateSalary: async (data) => {
        let conn;
        let result;

        try {

            conn = await pool.connect();

            await conn.query('BEGIN');

            const insertSql = `
                INSERT INTO salary_history (sh_emp_id, sh_salary_amount, sh_effective_date)
                VALUES ($1, $2, $3)
            `;
            await conn.query(insertSql, [
                data.sh_emp_id,
                data.sh_salary_amount,
                data.sh_effective_date
            ]);

            const updateEmpSql = `
                UPDATE employee
                SET emp_current_salary = $1
                WHERE emp_id = $2
            `;
            await conn.query(updateEmpSql, [
                data.sh_salary_amount,
                data.sh_emp_id
            ]);

            await conn.query('COMMIT');

            result = {
                isError: false,
                data: "เพิ่มเงินเดือนสำเร็จ",
                errorMessage: ""
            };

        } catch (error) {

            if (conn) await conn.query('ROLLBACK');

            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            };

        } finally {
            if (conn) {
                conn.release();
            }

            return result;
        }
    }
};