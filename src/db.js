// initialize the postgres database
const { Pool } = require('pg');

var appRoot = require('app-root-path');

pg_keys = require(appRoot + '/secrets/pg.keys.json');

const pool = new Pool({
    user: pg_keys.USERNAME,
    password: pg_keys.PASSWORD,
    host: pg_keys.HOST,
    port: 5432,
});

// if unable to connect to database, exit
pool.on('error', (err, client) => {
    console.error('Unable to connect to client. Error: ', err);
    process.exit(-1);
});

async function getUserTokens(userId) {
    const query = {
        text: 'SELECT * FROM users WHERE user_id = $1',
        values: [userId],
    };

    const res = await pool.query(query);
    return res.rows[0];
}

async function setUserTokens(userId, tokens) {
    const query = {
        text: 'INSERT INTO users (user_id, access_token, refresh_token, expiry_date) VALUES ($1, $2, $3, $4)',
        values: [userId, tokens.access_token, tokens.refresh_token, tokens.expiry_date],
    };

    await pool.query(query);
}
     
async function getFile(messageId) {
    const query = {
        text: 'SELECT * FROM files WHERE message_id = $1',
        values: [messageId],
    };

    const res = await pool.query(query);
    return res.rows[0];
}

async function setFile(messageId, fileId, fileUrl) {
    const query = {
        text: 'INSERT INTO files (message_id, file_id, file_url) VALUES ($1, $2, $3)',
        values: [messageId, fileId, fileUrl],
    };

    await pool.query(query);
}

async function initTables() {
    // if tables don't exist, create them.
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR(255) PRIMARY KEY,
        access_token VARCHAR(255) NOT NULL,
        refresh_token VARCHAR(255) NOT NULL,
        expiry_date VARCHAR(255) NOT NULL
    );`);

    await pool.query(`CREATE TABLE IF NOT EXISTS files (
        message_id VARCHAR(255) PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        file_url VARCHAR(255) NOT NULL
    );`);
}

module.exports = { 
    initTables,
    getUserTokens,
    setUserTokens,
    getFile,
    setFile 
};