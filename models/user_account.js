const pool = require('../libs/db_pool');
const dateUtils = require('../libs/date_utils');

module.exports = {
    getUserAccountById: async (userId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = "SELECT account_id AS user_id, account_username FROM account WHERE account_id = $1";

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

            var sql = "SELECT account_username FROM account WHERE "
                + "encode(digest(account_username || '&' || $1, 'sha256'), 'hex') = $2";

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
                        a.account_id AS user_id, 
                        a.account_username, 
                        a.emp_id, 
                        e.emp_firstname AS firstname,
                        e.emp_lastname AS lastname,
                        CONCAT(e.emp_firstname, ' ', e.emp_lastname) AS full_name, 
                        r.account_role_name AS user_role_name, 
                        r.account_role_id AS user_role_id
                    FROM account a
                    INNER JOIN account_role r ON a.account_role_id = r.account_role_id
                    INNER JOIN employee e ON a.emp_id = e.emp_id
                    WHERE encode(digest(a.account_username || '&' || LOWER(TRIM(a.account_password_hash)) || '&' || $1, 'sha256'), 'hex') = $2
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