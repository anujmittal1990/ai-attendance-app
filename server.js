const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'u958815946_ai_attend_user',
    password: process.env.DB_PASSWORD || 'Indicraft@2026',
    database: process.env.DB_NAME || 'u958815946_ai_attend',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err.message);
    } else {
        console.log('Connected to MySQL database pool successfully.');
        connection.release();
    }
});

/**
 * 1. EMPLOYEE REGISTRATION API
 */
app.post('/api/employees', (req, res) => {
    const { userId, name, faceDescriptor } = req.body;

    if (!userId || !name || !faceDescriptor) {
        return res.status(400).json({ status: 'error', message: 'Missing required employee fields or face vector.' });
    }

    const descriptorString = typeof faceDescriptor === 'string' 
        ? faceDescriptor 
        : JSON.stringify(faceDescriptor);

    const query = `INSERT INTO employees (user_id, name, face_descriptor) VALUES (?, ?, ?) 
                   ON DUPLICATE KEY UPDATE name = VALUES(name), face_descriptor = VALUES(face_descriptor)`;

    db.query(query, [userId, name, descriptorString], (err) => {
        if (err) {
            console.error('Error saving employee profile:', err);
            return res.status(500).json({ status: 'error', message: 'Failed to save employee profile.' });
        }
        res.json({ status: 'success', message: `Employee "${name}" registered successfully!` });
    });
});

/**
 * 2. FETCH ALL REGISTERED EMPLOYEES
 */
app.get('/api/employees', (req, res) => {
    const query = `SELECT user_id, name, face_descriptor FROM employees`;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching employees:', err);
            return res.status(500).json({ status: 'error', message: 'Failed to load employee master data.' });
        }

        try {
            const employees = results.map(emp => ({
                userId: emp.user_id,
                name: emp.name,
                faceDescriptor: typeof emp.face_descriptor === 'string' 
                    ? JSON.parse(emp.face_descriptor) 
                    : emp.face_descriptor
            }));

            res.json({ status: 'success', employees });
        } catch (parseErr) {
            console.error('Error parsing employee face descriptors:', parseErr);
            res.status(500).json({ status: 'error', message: 'Error processing face profiles.' });
        }
    });
});

/**
 * 3. AI ATTENDANCE LOGGING API
 */
app.post('/api/attendance', (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ status: 'error', message: 'User ID missing from request payload.' });
    }

    const checkQuery = `
        SELECT 
            e.name,
            (SELECT COUNT(*) FROM attendance WHERE user_id = ? AND DATE(timestamp) = CURDATE()) AS already_marked
        FROM employees e
        WHERE e.user_id = ?
    `;

    db.query(checkQuery, [userId, userId], (err, results) => {
        if (err) {
            console.error('Database validation error:', err);
            return res.status(500).json({ status: 'error', message: 'Database error while checking attendance status.' });
        }

        if (results.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Recognized face does not match any registered employee.' });
        }

        const employeeName = results[0].name;

        if (results[0].already_marked > 0) {
            return res.status(200).json({ 
                status: 'exists', 
                message: `Attendance already marked today for ${employeeName}.` 
            });
        }

        const insertQuery = `INSERT INTO attendance (user_id) VALUES (?)`;
        db.query(insertQuery, [userId], (err) => {
            if (err) {
                console.error('Attendance insertion error:', err);
                return res.status(500).json({ status: 'error', message: 'Failed to record attendance.' });
            }

            res.json({
                status: 'success',
                message: `Attendance marked successfully for ${employeeName}!`
            });
        });
    });
});

/**
 * 4. FETCH ATTENDANCE LOGS API (NEW)
 * Supports optional date filter via query param: /api/attendance-logs?date=YYYY-MM-DD
 */
app.get('/api/attendance-logs', (req, res) => {
    const { date } = req.query;
    
    let query = `
        SELECT a.id, a.user_id, e.name, a.timestamp 
        FROM attendance a
        JOIN employees e ON a.user_id = e.user_id
    `;
    const queryParams = [];

    if (date) {
        query += ` WHERE DATE(a.timestamp) = ?`;
        queryParams.push(date);
    }

    query += ` ORDER BY a.timestamp DESC LIMIT 100`;

    db.query(query, queryParams, (err, results) => {
        if (err) {
            console.error('Error fetching attendance logs:', err);
            return res.status(500).json({ status: 'error', message: 'Failed to fetch attendance logs.' });
        }
        res.json({ status: 'success', logs: results });
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AI Attendance Server running on port ${PORT}`));
