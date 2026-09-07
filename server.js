const { log, error } = require('console');
const bp = require('body-parser');
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const userAccountModel = require('./models/user_account');
const jwt = require('./libs/jwt');
const dateUtils = require('./libs/date_utils.js');
const dashboardModel = require('./models/dashboard.js');
const incomeModel = require('./models/income.js');
const empModel = require('./models/employee.js');
const vehiclessearch = require('./models/vehicle_search.js');
const addnewcustomer = require('./models/customer.js');
const orderModel = require('./models/order.js');
const titleModel = require('./models/title.js');
const userRoleModel = require('./models/user_role.js');
const partModel = require('./models/part.js');
const vehicleModel = require('./models/vehicle.js');

const vehicle2Model = require('./models/vehicle2.js');
const order2Model = require('./models/order2.js');

const app = express();

app.use(bp.urlencoded({ limit: '50mb', extended: true }));
app.use(bp.json({ limit: '50mb' }));
const cors = require('cors');
app.use(cors());

// สร้างโฟลเดอร์ uploads ถ้ายังไม่มี และเปิดให้อ่านไฟล์รูปได้
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

app.get("/api/users", (req, res) => {
    var response = {
        isError: true,
        data: "You are unauthorized for this data"
    };

    res.send(JSON.stringify(response)); // แปลง jsObj เป็น JSON
});

app.post("/api/multiple_by_2", (req, res) => {
    var response = {
        isError: false,
        data: {
            no1: req.body.no_1 * 1,
            no2: req.body.no_2 * 2
        }
    };
    res.send(JSON.stringify(response));
});

app.get("/api/user/:userId", async (req, res) => {
    const userId = req.params.userId; //.params เก็บข้อมูลที่ได้จาก URL มาเป็น jsObj
    const response = await userAccountModel.getUserAccountById(userId);
    res.send(JSON.stringify(response));
});

app.post("/api/authen/authen_request", async (req, res) => {
    console.log('authenRequestString: ' + req.body.authen_request)
    const authenRequest = req.body.authen_request;
    const result = await userAccountModel.checkAuthenRequest(authenRequest);
    console.log(result);

    if (result.isError) {
        response = {
            isError: true,
            data: "",
            errorMessage: result.errorMessage
        };
    } else {
        var payload = {
            username: result.data[0].account_username // เอาข้อมูลจาก result ทั้งหมดของคนแรกและเอาแค่ account_username
        }
        const authenToken = jwt.sign(payload);
        response = {
            isError: false,
            data: authenToken,
            errorMessage: ""
        }
    }

    res.send(JSON.stringify(response));
});

app.post("/api/authen/access_request", async (req, res) => {
    const authenSignature = req.body.authen_signature;
    const authenToken = req.body.authen_token;

    let response;
    let decode;

    try {
        decode = await jwt.verify(authenToken);
    } catch (err) {
        decode = null;
    }

    if (decode) {
        const result = await userAccountModel.checkAccessRequest(authenSignature, authenToken);
        console.log('result verify token: ' + result);

        if (result.isError) {
            response = {
                isError: true,
                data: "",
                errorMessage: result.errorMessage
            };
        } else {
            var payload = {
                user_id: result.data[0].user_id,
                username: result.data[0].account_username,
                emp_id: result.data[0].emp_id,
                firstname: result.data[0].firstname,
                lastname: result.data[0].lastname,
                full_name: result.data[0].full_name,
                role_name: result.data[0].user_role_name,
                role_id: result.data[0].user_role_id,
                date: dateUtils.getCurrentDateForToken()
            };
            const accessToken = jwt.sign(payload);
            response = {
                isError: false,
                data: {
                    access_token: accessToken,
                    user_id: result.data[0].user_id,
                    account_id: result.data[0].account_id,
                    role_name: result.data[0].user_role_name,
                    role_id: result.data[0].user_role_id,
                    full_name: result.data[0].full_name
                },
                errorMessage: ""
            }
        }
    } else {
        response = {
            isError: true,
            data: "",
            errorMessage: "ข้อมูลไม่ถูกต้อง"
        };
    }

    res.send(JSON.stringify(response));
});

const checkAccessToken = (req, res, next) => {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.query && req.query.token) {
        token = req.query.token;
    } else {
        token = req.body.token;
    }

    jwt.verify(token)
        .then((decode) => {
            req.decode = decode;
            req.user = decode;
            next();
        }, (err) => {
            res.json({
                isError: true,
                data: [],
                errorMessage: "ยังไม่ได้เข้าสู่ระบบ"
            });
        });
}

app.get("/api/dashboard/summary", checkAccessToken, async (req, res) => {
    const response = await dashboardModel.getSummaryData();
    res.json(response);
});

app.get("/api/income/monthly_history", checkAccessToken, async (req, res) => {
    const response = await incomeModel.getMonthlyIncomeHistory();
    res.json(response);
});

app.get("/api/employee", checkAccessToken, async (req, res) => {
    const response = await empModel.getEmployee();
    res.json(response);
});

app.get("/api/vehicle", checkAccessToken, async (req, res) => {
    try {
        const searchVehicalOrCustomer = req.query.searchVehicalOrCustomer;
        if (!searchVehicalOrCustomer) {
            return res.json({
                isError: true,
                data: null,
                errorMessage: "กรุณาระบุคำค้นหา (searchVehicalOrCustomer)"
            });
        }
        const response = await vehiclessearch.searchVehicalOrCustomer(searchVehicalOrCustomer);
        res.json(response);
    } catch (error) {
        res.json({
            isError: true,
            data: null,
            errorMessage: error.message
        });
    }
});

app.post("/api/addnewcustomer", checkAccessToken, async (req, res) => {
    try {
        await addnewcustomer.createVehicalIntake(req, res);
    } catch (error) {
        console.error("Route /api/addnewcustomer Error:", error);
        if (!res.headersSent) {
            return res.status(500).json({
                isError: true,
                errorMessage: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ ไม่สามารถดำเนินการได้",
            });
        }
    }
});

app.post("/api/addvehicle", checkAccessToken, async (req, res) => {
    try {
        await addnewcustomer.addVehicle(req, res);
    } catch (error) {
        console.error("Route /api/addvehicle Error:", error);
        if (!res.headersSent) {
            return res.status(500).json({
                isError: true,
                errorMessage: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ ไม่สามารถดำเนินการได้",
            });
        }
    }
});

app.post("/api/addorder", checkAccessToken, async (req, res) => {
    try {
        await orderModel.addOrder(req, res);
    } catch (error) {
        console.error("Route /api/addorder Error:", error);
        if (!res.headersSent) {
            return res.status(500).json({
                isError: true,
                errorMessage: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ ไม่สามารถดำเนินการได้",
            });
        }
    }
});

app.get("/api/orders", checkAccessToken, async (req, res) => {
    try {
        await orderModel.getOrders(req, res);
    } catch (error) {
        console.error("Route /api/orders Error:", error);
        if (!res.headersSent) {
            return res.status(500).json({
                isError: true,
                errorMessage: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ ไม่สามารถดำเนินการได้",
            });
        }
    }
});

app.get("/api/title", checkAccessToken, async (req, res) => {
    const response = await titleModel.getTitle();
    res.json(response);
});

app.get("/api/priority", checkAccessToken, async (req, res) => {
    const response = await order2Model.getPriorities();
    res.json(response);
});

app.get("/api/order_status", checkAccessToken, async (req, res) => {
    const response = await order2Model.getOrderStatuses();
    res.json(response);
});

app.get("/api/all_orders", checkAccessToken, async (req, res) => {
    const response = await order2Model.getAllOrders();
    res.json(response);
});

app.get("/api/order/technicians", checkAccessToken, async (req, res) => {
    try {
        const orderId = req.query.order_id;
        if (!orderId) {
            return res.status(400).json({
                isError: true,
                data: [],
                errorMessage: "กรุณาระบุ order_id"
            });
        }
        const response = await order2Model.getOrderTechnicians(orderId);
        res.json(response);
    } catch (error) {
        res.status(500).json({
            isError: true,
            data: [],
            errorMessage: error.message
        });
    }
});

app.post("/api/order/accept", checkAccessToken, async (req, res) => {
    try {
        const orderId = req.body.order_id;
        const accountId = req.user.user_id;

        if (!orderId) {
            return res.status(400).json({
                isError: true,
                data: null,
                errorMessage: "กรุณาระบุ order_id"
            });
        }

        const response = await order2Model.acceptOrder(orderId, accountId);
        res.json(response);
    } catch (error) {
        res.status(500).json({
            isError: true,
            data: null,
            errorMessage: error.message
        });
    }
});

app.post("/api/order/cancel_technician", checkAccessToken, async (req, res) => {
    try {
        const orderId = req.body.order_id;
        const accountId = req.user.user_id;

        if (!orderId) {
            return res.status(400).json({
                isError: true,
                data: null,
                errorMessage: "กรุณาระบุ order_id"
            });
        }

        const response = await order2Model.cancelOrderTechnician(orderId, accountId);
        res.json(response);
    } catch (error) {
        res.status(500).json({
            isError: true,
            data: null,
            errorMessage: error.message
        });
    }
});

app.post("/api/order/update_status", checkAccessToken, async (req, res) => {
    try {
        const { order_id, status_id } = req.body;
        const response = await order2Model.updateOrderStatus(order_id, status_id);
        res.json(response);
    } catch (error) {
        res.status(500).json({
            isError: true,
            data: null,
            errorMessage: error.message
        });
    }
});

app.get("/api/user_role", checkAccessToken, async (req, res) => {
    const response = await userRoleModel.getUserRole();
    res.json(response);
});

app.post("/api/employee", checkAccessToken, async (req, res) => {
    const createByEmpId = req.user.emp_id;
    const response = await empModel.addEmployee(req.body, createByEmpId);
    res.json(response);
});

app.put("/api/employee", checkAccessToken, async (req, res) => {
    const response = await empModel.updateEmployee(req.body);
    res.json(response);
});

app.delete("/api/employee", checkAccessToken, async (req, res) => {
    const empId = req.body.emp_id;
    const response = await empModel.deleteEmployee(empId);
    res.json(response);
});

app.get("/api/part", checkAccessToken, async (req, res) => {
    const response = await partModel.getPart();
    res.json(response);
});

app.post("/api/part", checkAccessToken, async (req, res) => {
    const response = await partModel.addPart(req.body);
    res.json(response);
});

app.put("/api/part", checkAccessToken, async (req, res) => {
    const response = await partModel.editPart(req.body);
    res.json(response);
});

app.delete("/api/part", checkAccessToken, async (req, res) => {
    const partId = req.body.part_id;
    const response = await partModel.deletePart(partId);
    res.json(response);
});

// Vehicle Brand routes
app.get("/api/vehicle_brand", checkAccessToken, async (req, res) => {
    const response = await vehicleModel.getBrands();
    res.json(response);
});
app.post("/api/vehicle_brand", checkAccessToken, async (req, res) => {
    const response = await vehicleModel.addBrand(req.body);
    res.json(response);
});
app.put("/api/vehicle_brand", checkAccessToken, async (req, res) => {
    const response = await vehicleModel.updateBrand(req.body);
    res.json(response);
});
app.delete("/api/vehicle_brand", checkAccessToken, async (req, res) => {
    const brandId = req.body.brand_id;
    const response = await vehicleModel.deleteBrand(brandId);
    res.json(response);
});

// Vehicle Model routes
app.get("/api/vehicle_model", checkAccessToken, async (req, res) => {
    const response = await vehicleModel.getModels();
    res.json(response);
});
app.post("/api/vehicle_model", checkAccessToken, async (req, res) => {
    const response = await vehicleModel.addModel(req.body);
    res.json(response);
});
app.put("/api/vehicle_model", checkAccessToken, async (req, res) => {
    const response = await vehicleModel.updateModel(req.body);
    res.json(response);
});
app.delete("/api/vehicle_model", checkAccessToken, async (req, res) => {
    const modelId = req.body.veh_model_id;
    const response = await vehicleModel.deleteModel(modelId);
    res.json(response);
});

// Vehicle Year routes
app.get("/api/vehicle_year", checkAccessToken, async (req, res) => {
    const response = await vehicleModel.getYears();
    res.json(response);
});
app.post("/api/vehicle_year", checkAccessToken, async (req, res) => {
    const response = await vehicleModel.addYear(req.body);
    res.json(response);
});
app.put("/api/vehicle_year", checkAccessToken, async (req, res) => {
    const response = await vehicleModel.updateYear(req.body);
    res.json(response);
});
app.delete("/api/vehicle_year", checkAccessToken, async (req, res) => {
    const yearId = req.body.veh_year_id;
    const response = await vehicleModel.deleteYear(yearId);
    res.json(response);
});

app.post("/api/vehicle_search_licensePlate", async (req, res) => {
    const licenseplate = req.body.v_license_plate;
    const response = await vehicle2Model.searchLicenseplate(licenseplate);
    res.json(response);
});

app.post("/api/vehicle_search_phone", async (req, res) => {
    const phone = req.body.phone;
    const response = await vehicle2Model.searchPhone(phone);
    res.json(response);
});

app.post("/api/add_customer", async (req, res) => {
    const response = await addnewcustomer.addCustomer(req.body);
    res.json(response);
});

app.post("/api/vehicle_orders", async (req, res) => {
    const vehicleId = req.body.vehicle_id;
    const response = await order2Model.getOrdersByVehicleId(vehicleId);
    res.json(response);
});

app.post("/api/create_order", async (req, res) => {
    const response = await order2Model.createOrder(req.body);
    res.json(response);
});

const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/planin');
    res.end('Hello Uncle');
});

app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});