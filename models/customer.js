const pool = require("../libs/db_pool.js");

module.exports = {
    addCustomer: async (data) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();
            await conn.query('BEGIN');

            var customerSql = `
                INSERT INTO customer (
                    cus_title_id,
                    cus_first_name,
                    cus_last_name,
                    cus_phone,
                    cus_created_by_account_id
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING cus_id;
            `;

            const cusRes = await conn.query(customerSql, [
                data.cus_title_id,
                data.cus_first_name,
                data.cus_last_name,
                data.cus_phone,
                data.cus_created_by_account_id
            ]);

            const newCusId = cusRes.rows[0].cus_id;

            var vehicleSql = `
                INSERT INTO vehicle (
                    v_license_plate,
                    v_vehicle_model_id,
                    v_year,
                    v_color,
                    v_customer_id
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING v_id;
            `;

            const vehRes = await conn.query(vehicleSql, [
                data.v_license_plate,
                data.v_vehicle_model_id,
                data.v_year,
                data.v_color,
                newCusId
            ]);

            await conn.query('COMMIT');

            result = {
                isError: false,
                data: {
                    cus_id: newCusId,
                    v_id: vehRes.rows[0].v_id
                },
                errorMessage: ""
            };

        } catch (error) {
            if (conn) await conn.query('ROLLBACK');
            return {
                isError: true,
                data: "",
                errorMessage: error.message
            };

        } finally {
            if (conn)
                conn.release();

            return result;
        }
    }
};
