const pool = require('../libs/db_pool');
const dateUtils = require('../libs/date_utils');

module.exports = {
    getUserAccountById: async (userId) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = "SELECT user_id, account_username FROM users WHERE user_id = $1";

            var rows = await conn.query(sql, [userId]); // accountId is Arrary ช่วยป้องกันจากการเจาะ $1

            result = {
                isError: false,
                data: rows
            };

        } catch (error) {
            result = {
                isError: true,
                errorMessage: error.message
            }
        } finally {
            if (conn)
                conn.release(); // .release ส่งคืน Connection กลับเข้าไปใน Pool

            return result;
        }
    },

    checkAuthenRequest: async (authenRequest) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = "SELECT account_username FROM users WHERE "
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
                        u.user_id, 
                        u.account_username, 
                        u.emp_id, 
                        CONCAT(u.firstname, ' ', u.lastname) AS full_name, 
                        r.user_role_name 
                    FROM users u
                    INNER JOIN user_role r ON u.user_role_id = r.user_role_id
                    WHERE encode(digest(u.account_username || '&' || LOWER(TRIM(u.account_password)) || '&' || $1, 'sha256'), 'hex') = $2
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