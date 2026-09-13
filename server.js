const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware setup
app.use(express.json({ limit: '10mb' })); // Handles incoming face array descriptors
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Root route handler
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Database Connection Pool
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test Database Connection
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
 * Receives { userId, name, faceDescriptor } from the front-end registration modal
 */
app.post('/api/employees', (req, res) => {
    const { userId, name, faceDescriptor } = req.body;

    if (!userId || !name || !faceDescriptor) {
        return res.status(400).json({ status: 'error', message: 'Missing required employee fields or face vector.' });
    }

    // Ensure array is properly stringified for MySQL JSON / TEXT column storage
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
 * 2. FETCH ALL REGISTERED EMPLOYEES & FACE DESCRIPTORS
 * Serves descriptors to frontend to build faceapi.FaceMatcher on page load or post-registration
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
 * Handles attendance verification and insertion in an optimized single flow
 */
app.post('/api/attendance', (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ status: 'error', message: 'User ID missing from request payload.' });
    }

    // Single query to get employee name and check if attendance was logged today
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

        // Block re-registration if face was already logged today
        if (results[0].already_marked > 0) {
            return res.status(200).json({ 
                status: 'exists', 
                message: `Attendance already marked today for ${employeeName}.` 
            });
        }

        // Insert new record into attendance database
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AI Attendance Server running on port ${PORT}`));
