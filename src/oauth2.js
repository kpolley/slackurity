const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { getUserTokens, setUserTokens } = require('./db');

var appRoot = require('app-root-path');

// get key path, which is a directory above this file
const keyPath = appRoot + '/secrets/oauth2.keys.json';
let keys = {redirect_uris: ['']};
if (fs.existsSync(keyPath)) {
  keys = require(keyPath).web;
}

// if env LOCAL is set, use local redirect uri
const redirect_uri_index = process.env.LOCAL ? 0 : 1;

async function authenticate(userId, code) {
    /*
    Authenticate the user with the given code
    Stores the user's tokens in the database
    */

    return new Promise((resolve, reject) => {
        const oauth2Client = new google.auth.OAuth2(
            keys.client_id,
            keys.client_secret,
            keys.redirect_uris[redirect_uri_index] 
        );

        oauth2Client.getToken(code, (err, tokens) => {
            if (err) {
                console.error('Error getting oAuth tokens:');
                reject(err);
            }
            // Store the oauth2Client for the user
            setUserTokens(userId, tokens);

            resolve();
        });
    });
}

async function generateAuthUrl(userId, scopes) {
    /*
    Generate a url for the user to authenticate with
    the given scopes
    */

    const oauth2Client = new google.auth.OAuth2(
        keys.client_id,
        keys.client_secret,
        keys.redirect_uris[redirect_uri_index] 
    );

    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes.join(' '),
        state: userId
    });
}

async function getUserOAuthClient(user_id) {
    /*
    Get the user's tokens from the database
    and return an OAuth2Client
    */

    token = await getUserTokens(user_id);
    if (token) {
        const oauth2Client = new google.auth.OAuth2(
            keys.client_id,
            keys.client_secret,
            keys.redirect_uris[redirect_uri_index] 
        );
        oauth2Client.setCredentials(token);
        return oauth2Client;
    }
    return null;
}

async function isAuthed(userId) {
    /*
    Check if the user already has tokens in the database
    */

    tokens = await getUserTokens(userId);
    if (!tokens) {
        return false;
    }
    return true;
}

module.exports = {
    authenticate,
    generateAuthUrl,
    getUserOAuthClient,
    isAuthed
}