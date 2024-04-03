/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');

admin.initializeApp();
const app = express();

app.use(express.json());
app.use(cors());

app.post('/createUser', async (req, res) => {
    const { fullName, email, password, username } = req.body;

    // Search for an existing user with the provided email
    const usersRef = admin.database().ref('users').orderByChild('email').equalTo(email).limitToFirst(1);
    usersRef.once('value', snapshot => {
        if (snapshot.exists()) {
            // User already exists
            return res.status(400).send('A user with this email already exists.');
        } else {
            // No user found, proceed with creating a new user
            const createdAt = new Date().toISOString();
            const role = 'user'; // Default role, can be adjusted based on the application's needs

            // Hash the password before storing it
            bcrypt.hash(password, 10, function(err, hash) {
                if (err) {
                    logger.error("Error hashing password:", err);
                    return res.status(500).send('Error processing password');
                }
                // Create user data including the hashed password
                const userData = { fullName, email, password: hash, username, createdAt, role };

                // Add the new user to the database
                admin.database().ref('users').push(userData)
                    .then(() => res.status(200).send('User created successfully'))
                    .catch((error) => {
                        logger.error("Error adding user data:", error);
                        res.status(500).send('Error adding user data: ' + error);
                    });
            });
        }
    });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Placeholder for user search logic
    // In a real application, you would search the database for the user by email
    // This example assumes you have a way to retrieve the user's data by email
    const userRef = admin.database().ref('users').orderByChild('email').equalTo(email).limitToFirst(1);
    userRef.once('value', snapshot => {
        if (snapshot.exists()) {
            const userData = Object.values(snapshot.val())[0];
            bcrypt.compare(password, userData.password, function(err, result) {
                if (err) {
                    logger.error("Authentication error:", err);
                    return res.status(500).send('Authentication error');
                }
                if (result) {
                    // Login successful
                    res.status(200).send('Login successful');
                } else {
                    // Password does not match
                    res.status(401).send('Incorrect password');
                }
            });
        } else {
            // User not found
            res.status(404).send('There is no user associated with that email address. Create an account now!');
        }
    });
});

app.delete('/deleteUser', async (req, res) => {
    const { email, password } = req.body;

    // Again, assuming there's a way to find a user by email
    const userRef = admin.database().ref('users').orderByChild('email').equalTo(email).limitToFirst(1);
    userRef.once('value', snapshot => {
        if (snapshot.exists()) {
            const userKey = Object.keys(snapshot.val())[0];
            const userData = Object.values(snapshot.val())[0];
            bcrypt.compare(password, userData.password, function(err, result) {
                if (err) {
                    logger.error("Authentication error:", err);
                    return res.status(500).send('Authentication error');
                }
                if (result) {
                    // Password matches, proceed with deletion
                    admin.database().ref(`users/${userKey}`).remove()
                        .then(() => res.status(200).send('User deleted successfully'))
                        .catch((deleteError) => {
                            logger.error("Error deleting user:", deleteError);
                            res.status(500).send('Error deleting user');
                        });
                } else {
                    // Password does not match
                    res.status(401).send('Incorrect password');
                }
            });
        } else {
            // User not found
            res.status(404).send('User not found');
        }
    });
});

exports.app = functions.https.onRequest(app);
//firebase deploy --only functions