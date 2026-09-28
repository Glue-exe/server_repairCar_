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
                    e.emp_title_id,
                    t.t_name,
                    e.emp_first_name,
                    e.emp_last_name,
                    e.emp_phone,
                    e.emp_current_salary,
                    a.acc_id,
                    a.acc_employee_id,
                    a.acc_username,
                    a.acc_role_id,
                    a.acc_status_id,
                    r.ar_name,
                    s.as_name
                FROM employee e
                INNER JOIN title t ON e.emp_title_id = t.t_id
                INNER JOIN account a ON e.emp_id = a.acc_employee_id
                INNER JOIN account_role r ON a.acc_role_id = r.ar_id
                INNER JOIN account_status s ON a.acc_status_id = s.as_id
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

    addEmployee: async (data, createByAccountId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query('BEGIN');

            const empSql = `
                INSERT INTO employee 
                (
                    emp_title_id,
                    emp_first_name,
                    emp_last_name,
                    emp_phone,
                    emp_current_salary
                )
                    VALUES
                    ($1, $2, $3, $4, $5)
                RETURNING emp_id
            `;

            const empParams = [
                data.emp_title_id, 
                data.emp_first_name, 
                data.emp_last_name, 
                data.emp_phone, 
                data.emp_current_salary
            ];

            const empRes = await conn.query(empSql, empParams);
            const newEmpId = empRes.rows[0].emp_id;

            const accountSql = `
                INSERT INTO account 
                    (
                        acc_username,
                        acc_password_hash,
                        acc_role_id,
                        acc_employee_id,
                        acc_created_by_account_id,
                        acc_status_id
                     ) 
                        VALUES 
                    ($1, $2, $3, $4, $5, $6)
            `;

            const accountParams = [
                data.acc_username, 
                data.acc_password_hash, 
                data.acc_role_id, 
                newEmpId,
                createByAccountId, 
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
                data.emp_title_id,
                data.emp_first_name,
                data.emp_last_name,
                data.emp_phone,
                data.emp_current_salary,
                data.emp_id
            ];

            await conn.query(empSql, empParams);

            const accountSql = `
                UPDATE account
                SET acc_role_id = $1
                WHERE acc_employee_id = $2
            `;
            
            const accountParams = [data.acc_role_id, data.emp_id];

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
    },

    updateEmployeeStatus: async (empId, statusId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            const sql = "UPDATE account SET acc_status_id = $1 WHERE acc_employee_id = $2";
            await conn.query(sql, [statusId, empId]);

            result = {
                isError: false,
                data: "อัปเดตสถานะสำเร็จ",
                errorMessage: ""
            };
        } catch (error) {
            result = {
                isError: true,
                data: "",
                errorMessage: error.message
            };
        } finally {
            if (conn) conn.release();
            return result;
        }
    }
}
