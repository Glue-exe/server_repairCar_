const pool = require('../libs/db_pool');
const dateUtils = require('../libs/date_utils');

module.exports = {
    getUserAccountById: async (userId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = "SELECT acc_id AS user_id, acc_id AS account_id, acc_id AS id, acc_username AS account_username, acc_username AS username FROM account WHERE acc_id = $1";

            var rows = await conn.query(sql, [userId]);

            result = {
                isError: false,
                data: rows.rows
            };

        } catch (error) {
            result = {
                isError: true,
                errorMessage: error.message
            }
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    checkAuthenRequest: async (authenRequest) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = "SELECT acc_username AS account_username, acc_username AS username FROM account WHERE "
                + "encode(digest(acc_username || '&' || $1, 'sha256'), 'hex') = $2 "
                + "AND acc_status_id = 1";

            var rows = await conn.query(sql, [dateUtils.getCurrentDateForToken(), authenRequest]);

            if (rows.rowCount == 0) {
                result = {
                    isError: true,
                    errorMessage: "ไม่พบข้อมูลผู้ใช้ในระบบ"
                }
            } else {
                result = {
                    isError: false,
                    data: rows.rows
                };
            }
        } catch (error) {
            result = {
                isError: true,
                errorMessage: error.message
            }
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    },

    checkAccessRequest: async (authenSignature, authenToken) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                    SELECT 
                        a.acc_id AS user_id, 
                        a.acc_id AS account_id, 
                        a.acc_id AS id, 
                        a.acc_username AS account_username, 
                        a.acc_username AS username,
                        a.acc_employee_id AS emp_id, 
                        a.acc_employee_id AS employee_id,
                        e.emp_first_name AS firstname,
                        e.emp_first_name AS first_name,
                        e.emp_last_name AS lastname,
                        e.emp_last_name AS last_name,
                        CONCAT(e.emp_first_name, ' ', e.emp_last_name) AS full_name, 
                        r.ar_name AS user_role_name, 
                        r.ar_name AS name,
                        r.ar_id AS user_role_id,
                        r.ar_id AS id
                    FROM account a
                    INNER JOIN account_role r ON a.acc_role_id = r.ar_id
                    INNER JOIN employee e ON a.acc_employee_id = e.emp_id
                    WHERE encode(digest(a.acc_username || '&' || LOWER(TRIM(a.acc_password_hash)) || '&' || $1, 'sha256'), 'hex') = $2
                `;

            var rows = await conn.query(sql, [authenToken, authenSignature]);

            if (rows.rowCount == 0) {
                result = {
                    isError: true,
                    errorMessage: "รหัสผ่านไม่ถูกต้อง"
                }
            } else {
                result = {
                    isError: false,
                    data: rows.rows
                };
            }
        } catch (error) {
            result = {
                isError: true,
                errorMessage: error.message
            }
        } finally {
            if (conn)
                conn.release();

            return result;
        }
    }
}