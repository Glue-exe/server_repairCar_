const pool = require("../libs/db_pool.js");

module.exports = {
    searchLicenseplate: async (data) => {
        let conn;

        try {
            conn = await pool.connect();

            var searchLicenseplateSQL = `
                SELECT
                    cus.cus_first_name || ' ' || cus.cus_last_name AS fullname,
                    veh.v_license_plate,
                    vehModel.vm_name,
                    vehBrand.vb_name,
                    veh.v_year,
                    veh.v_color
                FROM vehicle AS veh
                INNER JOIN customer AS cus ON veh.v_customer_id = cus.cus_id
                INNER JOIN vehicle_model AS vehModel ON veh.v_vehicle_model_id = vehModel.vm_id
                INNER JOIN vehicle_brand AS vehBrand ON vehModel.vm_brand_id = vehBrand.vb_id

                WHERE veh.v_license_plate = $1;
            `;

            const rows = await conn.query(searchLicenseplateSQL, [data]);

            return {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };
            
        } catch (error) {
            return {
                isError: true,
                data: "",
                errorMessage: error.message
            };

        } finally {
            if (conn)
                conn.release();
        }
    },

    searchPhone: async (data) => {
        let conn;
        let result;

        try {
            conn = await pool.connect();

            var searchPhoneSQL = `
                SELECT
                    customer.cus_first_name || ' ' || customer.cus_last_name AS fullname,
                    customer.cus_first_name AS first_name,
                    customer.cus_last_name AS last_name,
                    customer.cus_phone AS phone,
                    vehicle.v_license_plate AS license_plate,
                    vehicle.v_year AS year,
                    vehicle.v_color AS color,
                    vehicle_model.vm_name AS model_name,
                    vehicle_brand.vb_name AS brand_name
                FROM customer
                INNER JOIN vehicle ON customer.cus_id = vehicle.v_customer_id
                INNER JOIN vehicle_model ON vehicle.v_vehicle_model_id = vehicle_model.vm_id
                INNER JOIN vehicle_brand ON vehicle_model.vm_brand_id = vehicle_brand.vb_id
                WHERE customer.cus_phone = $1;
            `;

            const rows = await conn.query(searchPhoneSQL, [data]);

            result = {
                isError: false,
                data: rows.rows,
                errorMessage: ""
            };

        } catch (error) {
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
}