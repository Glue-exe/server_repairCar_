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
                    (title_id, emp_firstname, emp_lastname, emp_phone, user_role_id, emp_salary)
                VALUES 
                    ($1, $2, $3, $4, $5, $6)
                RETURNING emp_id
            `;

            const empParams = [
                data.title_id, data.firstname, data.lastname,
                data.phone, data.user_role_id, salary
            ];

            const empRes = await conn.query(empSql, empParams);
            const newEmpId = empRes.rows[0].emp_id;

            const userSql = `
                INSERT INTO users 
                    (account_username, account_password, user_role_id, emp_id, firstname, lastname, create_by) 
                VALUES 
                    ($1, $2, $3, $4, $5, $6, $7)
            `;

            const userParams = [
                data.username, data.password, data.user_role_id, newEmpId,
                data.firstname, data.lastname, createByEmpId
            ];

            await conn.query(userSql, userParams);

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
                    user_role_id = $5,
                    emp_salary = $6
                WHERE emp_id = $7
            `;

            const empParams = [
                data.title_id, 
                data.firstname, 
                data.lastname,
                data.phone, 
                data.user_role_id, 
                salary,
                data.emp_id
            ];

            await conn.query(empSql, empParams);

            const userSql = `
                UPDATE users
                SET firstname = $1, lastname = $2, user_role_id = $3
                WHERE emp_id = $4
            `;
            const userParams = [data.firstname, data.lastname, data.user_role_id, data.emp_id];

            await conn.query(userSql, userParams);

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

            const userSql = `DELETE FROM users WHERE emp_id = $1`;
            await conn.query(userSql, [emp_id]);

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
