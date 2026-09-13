const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
require('dotenv').config(); // Ensure env variables are loaded

const app = express();

// Middleware setup
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Use Connection Pool instead of single connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test DB pool connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err.message);
    } else {
        console.log('Connected to MySQL database pool successfully.');
        connection.release();
    }
});

/**
 * 1. EMPLOYEE MASTER & FACE DATA REGISTRATION API
 */
app.post('/api/employees', (req, res) => {
    const { userId, name, faceDescriptor } = req.body;

    if (!userId || !name || !faceDescriptor) {
        return res.status(400).json({ status: 'error', message: 'Missing required employee fields or face data.' });
    }

    const query = `INSERT INTO employees (user_id, name, face_descriptor) VALUES (?, ?, ?) 
                   ON DUPLICATE KEY UPDATE name = VALUES(name), face_descriptor = VALUES(face_descriptor)`;

    const stringifiedDescriptor = typeof faceDescriptor === 'string' ? faceDescriptor : JSON.stringify(faceDescriptor);

    db.query(query, [userId, name, stringifiedDescriptor], (err) => {
        if (err) {
            console.error('Error saving employee:', err);
            return res.status(500).json({ status: 'error', message: 'Internal database error.' });
        }
        res.json({ status: 'success', message: 'Employee and face profile configured successfully!' });
    });
});

/**
 * 2. FETCH ALL REGISTERED EMPLOYEES & FACE DESCRIPTORS
 */
app.get('/api/employees', (req, res) => {
    const query = `SELECT user_id, name, face_descriptor FROM employees`;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching employees:', err);
            return res.status(500).json({ status: 'error', message: 'Failed to fetch employee master data.' });
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
        } catch (parseError) {
            console.error('JSON parsing error on face descriptors:', parseError);
            res.status(500).json({ status: 'error', message: 'Error processing employee data.' });
        }
    });
});

/**
 * 3. AI ATTENDANCE LOGGING API
 */
app.post('/api/attendance', (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ status: 'error', message: 'User ID is missing from recognition payload.' });
    }

    // Combined query checking existence and duplicate attendance in one pass
    const checkQuery = `
        SELECT 
            e.name,
            (SELECT COUNT(*) FROM attendance WHERE user_id = ? AND DATE(timestamp) = CURDATE()) AS already_marked
        FROM employees e
        WHERE e.user_id = ?
    `;

    db.query(checkQuery, [userId, userId], (err, results) => {
        if (err) {
            console.error('Database error during validation:', err);
            return res.status(500).json({ status: 'error', message: 'Database error during validation.' });
        }

        if (results.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Recognized face does not match any configured employee.' });
        }

        const employeeName = results[0].name;
        if (results[0].already_marked > 0) {
            return res.status(200).json({ status: 'exists', message: `Attendance already marked today for ${employeeName}.` });
        }

        const insertQuery = `INSERT INTO attendance (user_id) VALUES (?)`;
        db.query(insertQuery, [userId], (err) => {
            if (err) {
                console.error('SQL Insert Error:', err);
                return res.status(500).json({ status: 'error', message: 'Failed to log attendance.' });
            }
            res.json({
                status: 'success',
                message: `Attendance marked successfully for ${employeeName}!`
            });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AI Attendance Server running on port ${PORT}`));
