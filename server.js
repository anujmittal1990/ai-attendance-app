const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();

// Essential middleware to parse incoming JSON payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Database connection configuration 
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'u958815946_ai_attend_user',
    password: process.env.DB_PASSWORD || 'Indicraft@2026',
    database: process.env.DB_NAME || 'u958815946_ai_attend'
});

db.connect(err => {
    if (err) {
        console.error('Database connection failed:', err);
    } else {
        console.log('Connected to MySQL database successfully.');
    }
});

// API endpoint to log attendance with error handling
app.post('/api/attendance', (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ status: 'error', message: 'User ID is missing.' });
    }
    
    const checkQuery = `SELECT * FROM attendance WHERE user_id = ? AND DATE(timestamp) = CURDATE()`;
    
    db.query(checkQuery, [userId], (err, results) => {
        if (err) {
            console.error('Database check error:', err);
            return res.status(500).json({ status: 'error', message: 'Database query failed.' });
        }
        
        if (results.length > 0) {
            return res.status(200).json({ status: 'exists', message: 'Attendance already marked today.' });
        }
        
        const insertQuery = `INSERT INTO attendance (user_id) VALUES (?)`;
        db.query(insertQuery, [userId], (err, result) => {
            if (err) {
                console.error('Database insert error:', err);
                return res.status(500).json({ status: 'error', message: 'Failed to insert attendance.' });
            }
            res.json({ status: 'success', message: 'Attendance marked successfully!' });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));