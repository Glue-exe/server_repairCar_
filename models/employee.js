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
                    a.account_role_id AS user_role_id,
                    r.account_role_name AS user_role_name,
                    e.emp_salary_current AS emp_salary,
                    COALESCE(s.status_name, 'ทำงานอยู่') AS emp_active
                FROM public.employee e
                LEFT JOIN public.title t ON e.title_id = t.title_id
                LEFT JOIN public.account a ON e.emp_id = a.emp_id
                LEFT JOIN public.account_role r ON a.account_role_id = r.account_role_id
                LEFT JOIN public.employee_status s ON a.status_id = s.status_id
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
                    (title_id, emp_firstname, emp_lastname, emp_phone, emp_salary_current)
                VALUES 
                    ($1, $2, $3, $4, $5)
                RETURNING emp_id
            `;

            const empParams = [
                data.title_id, data.firstname, data.lastname,
                data.phone, salary
            ];

            const empRes = await conn.query(empSql, empParams);
            const newEmpId = empRes.rows[0].emp_id;

            const accountSql = `
                INSERT INTO account 
                    (account_username, account_password_hash, account_role_id, emp_id, create_by, status_id) 
                VALUES 
                    ($1, $2, $3, $4, $5, $6)
            `;

            const accountParams = [
                data.username, data.password, data.user_role_id, newEmpId,
                createByEmpId || 1, 1
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
                SET title_id = $1, 
                    emp_firstname = $2, 
                    emp_lastname = $3, 
                    emp_phone = $4, 
                    emp_salary_current = $5
                WHERE emp_id = $6
            `;

            const empParams = [
                data.title_id, 
                data.firstname, 
                data.lastname,
                data.phone, 
                salary,
                data.emp_id
            ];

            await conn.query(empSql, empParams);

            const accountSql = `
                UPDATE account
                SET account_role_id = $1
                WHERE emp_id = $2
            `;
            const accountParams = [data.user_role_id, data.emp_id];

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

            const accountSql = `DELETE FROM account WHERE emp_id = $1`;
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
