const path = require("path");

const pad = (value) => String(value).padStart(2, "0");

// <entity>-<yyyyMMdd>-<HHmmss>-<rand4>.<ext>
const buildImageName = (entity, originalName) => {
    const now = new Date();

    const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const ext = path.extname(originalName).toLowerCase() || ".jpg";

    return `${entity}-${datePart}-${timePart}-${randomPart}${ext}`;
};

module.exports = { buildImageName };
