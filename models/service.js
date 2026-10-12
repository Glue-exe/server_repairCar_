const pool = require('../libs/db_pool');

module.exports = {
    getServices: async () => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var sql = `
                SELECT 
                    s_id AS id,
                    s_name AS name,
                    s_detail AS detail,
                    s_labor_cost AS labor_cost,
                    s_service_url AS service_url,
                    s_service_active AS is_active
                FROM service
                ORDER BY s_id ASC;
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
    },

    addService: async (data) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const serviceRes = await conn.query(
                `
                    INSERT INTO service (s_name, s_detail, s_labor_cost, s_service_url)
                    VALUES ($1, $2, $3, $4)
                    RETURNING s_id;
                `,
                [
                    data.s_name,
                    data.s_detail,
                    Number(data.s_labor_cost) || 0,
                    data.s_service_url,
                ]
            );

            result = {
                isError: false,
                data: {
                    service_id: serviceRes.rows[0].s_id,
                },
                errorMessage: "",
            };
        } catch (error) {
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) conn.release();
        }

        return result;
    },

    editService: async (data) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const oldRes = await conn.query(
                "SELECT s_service_url FROM service WHERE s_id = $1;",
                [data.s_id]
            );

            if (oldRes.rows.length === 0) {
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบบริการที่ต้องการแก้ไข",
                };
            }

            const oldServiceUrl = oldRes.rows[0].s_service_url;
            const shouldUpdateServiceUrl = data.s_service_url !== undefined;

            await conn.query(
                `
                    UPDATE service
                    SET s_name = $1,
                        s_detail = $2,
                        s_labor_cost = $3,
                        s_service_url = CASE WHEN $4 THEN $5 ELSE s_service_url END
                    WHERE s_id = $6;
                `,
                [
                    data.s_name,
                    data.s_detail,
                    Number(data.s_labor_cost) || 0,
                    shouldUpdateServiceUrl,
                    data.s_service_url,
                    data.s_id,
                ]
            );

            result = {
                isError: false,
                data: {
                    old_service_url: shouldUpdateServiceUrl ? oldServiceUrl : null,
                },
                errorMessage: "",
            };
        } catch (error) {
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) conn.release();
        }

        return result;
    },

    updateServiceStatus: async (serviceId, isActive) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            const res = await conn.query(
                `
                    UPDATE service
                    SET s_service_active = $1
                    WHERE s_id = $2
                    RETURNING s_id;
                `,
                [isActive, serviceId]
            );

            if (res.rows.length === 0) {
                return {
                    isError: true,
                    data: null,
                    errorMessage: "ไม่พบบริการที่ระบุ",
                };
            }

            result = {
                isError: false,
                data: "อัปเดตสถานะบริการสำเร็จ",
                errorMessage: "",
            };
        } catch (error) {
            result = {
                isError: true,
                data: null,
                errorMessage: error.message,
            };
        } finally {
            if (conn) conn.release();
        }

        return result;
    }
};
