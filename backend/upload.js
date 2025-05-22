const multer = require('multer');
const path = require('path');
const fs = require('fs');

const avatarDir = path.join(__dirname, 'public/uploads/avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, avatarDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

module.exports = upload;
