const { log, error } = require('console');
const bp = require('body-parser');
const express = require('express');
const http = require('http');
const userAccountModel = require('./models/user_account');
const jwt = require('./libs/jwt');
const dateUtils = require('./libs/date_utils.js');
const dashboardModel = require('./models/dashboard.js');
const incomeModel = require('./models/income.js');
const empModel = require('./models/employee.js');

const app = express();

app.use(bp.urlencoded({ extended: true }));  //.urlencoded() แปลงข้อมูล URL-encoded รูปแบบ HTML Form นำมาแยกให้เป็น obj (req.body) || true ใช้ libarly qs ในการแปลข้อมูล
app.use(bp.json()); // แปลง JSON เป็น jsObj เก็บใน req.body
const cors = require('cors');
app.use(cors()); // อนุญาตให้ทุกแอปวิ่งเข้ามาดึงข้อมูลได้

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
                firstname: result.data[0].firstname,
                lastname: result.data[0].lastname,
                full_name: result.data[0].full_name,
                role_name: result.data[0].user_role_name,
                date: dateUtils.getCurrentDateForToken()
            };
            const accessToken = jwt.sign(payload);
            response = {
                isError: false,
                data: {
                    access_token: accessToken,
                    role_name: result.data[0].user_role_name,
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