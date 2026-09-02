const pool = require('../libs/db_pool');

module.exports = {
    getEmployee: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    e.emp_id AS emp_id,
                    e.emp_id AS id,
                    e.emp_title_id AS title_id,
                    t.t_name AS title_name,
                    e.emp_first_name AS emp_firstname,
                    e.emp_first_name AS first_name,
                    e.emp_last_name AS emp_lastname,
                    e.emp_last_name AS last_name,
                    CONCAT(t.t_name, e.emp_first_name, ' ', e.emp_last_name) AS emp_fullname,
                    e.emp_phone AS emp_phone,
                    e.emp_phone AS phone,
                    a.acc_role_id AS user_role_id,
                    r.ar_name AS user_role_name,
                    e.emp_current_salary AS emp_salary,
                    e.emp_current_salary AS current_salary,
                    COALESCE(s.as_name, 'ทำงานอยู่') AS emp_active
                FROM public.employee e
                LEFT JOIN public.title t ON e.emp_title_id = t.t_id
                LEFT JOIN public.account a ON e.emp_id = a.acc_employee_id
                LEFT JOIN public.account_role r ON a.acc_role_id = r.ar_id
                LEFT JOIN public.account_status s ON a.acc_status_id = s.as_id
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
    },

    addEmployee: async (data, createByEmpId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query('BEGIN');

            let salary = 0;
            if (parseInt(data.user_role_id) === 2) {
                salary = 15000.00;
            } else if (parseInt(data.user_role_id) === 3) {
                salary = 12000.00;
            }

            const empSql = `
                INSERT INTO employee
                    (emp_title_id, emp_first_name, emp_last_name, emp_phone, emp_current_salary)
                VALUES 
                    ($1, $2, $3, $4, $5)
                RETURNING emp_id, emp_id AS id
            `;

            const empParams = [
                data.title_id || data.emp_title_id, 
                data.firstname || data.first_name || data.emp_first_name, 
                data.lastname || data.last_name || data.emp_last_name,
                data.phone || data.emp_phone, 
                salary
            ];

            const empRes = await conn.query(empSql, empParams);
            const newEmpId = empRes.rows[0].emp_id;

            const accountSql = `
                INSERT INTO account 
                    (acc_username, acc_password_hash, acc_role_id, acc_employee_id, acc_created_by_account_id, acc_status_id) 
                VALUES 
                    ($1, $2, $3, $4, $5, $6)
            `;

            const accountParams = [
                data.username || data.acc_username, 
                data.password || data.acc_password_hash, 
                data.user_role_id || data.acc_role_id, 
                newEmpId,
                createByEmpId || 1, 
                1
            ];

            await conn.query(accountSql, accountParams);

            await conn.query('COMMIT');

            result = {
                isError: false,
                data: "เพิ่มข้อมูลพนักงานสำเร็จ",
                errorMessage: ""
            };

        } catch (error) {
            if (conn) await conn.query('ROLLBACK');

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
    },

    updateEmployee: async (data) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query('BEGIN');

            let salary = 0;
            if (parseInt(data.user_role_id) === 2) {
                salary = 15000.00;
            } else if (parseInt(data.user_role_id) === 3) {
                salary = 12000.00;
            }

            const empSql = `
                UPDATE employee
                SET emp_title_id = $1, 
                    emp_first_name = $2, 
                    emp_last_name = $3, 
                    emp_phone = $4, 
                    emp_current_salary = $5
                WHERE emp_id = $6
            `;

            const empParams = [
                data.title_id || data.emp_title_id, 
                data.firstname || data.first_name || data.emp_first_name, 
                data.lastname || data.last_name || data.emp_last_name, 
                data.phone || data.emp_phone, 
                salary,
                data.emp_id || data.id
            ];

            await conn.query(empSql, empParams);

            const accountSql = `
                UPDATE account
                SET acc_role_id = $1
                WHERE acc_employee_id = $2
            `;
            const accountParams = [data.user_role_id || data.acc_role_id, data.emp_id || data.id];

            await conn.query(accountSql, accountParams);

            await conn.query('COMMIT');
            
            result = {
                isError: false,
                data: "แก้ไขข้อมูลสำเร็จ",
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
            if (conn) 
                conn.release();

            return result;
        }
    },

    deleteEmployee: async (emp_id) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query('BEGIN');

            const accountSql = `DELETE FROM account WHERE acc_employee_id = $1`;
            await conn.query(accountSql, [emp_id]);

            const empSql = `DELETE FROM employee WHERE emp_id = $1`;
            await conn.query(empSql, [emp_id]);

            await conn.query('COMMIT');

            result = {
                isError: false,
                data: "ลบข้อมูลเรียบร้อย",
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
            if(conn)
                conn.release();

            return result;
        }
    }
}
