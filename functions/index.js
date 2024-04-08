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

require('dotenv').config();

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

admin.initializeApp();
const app = express();

app.use(express.json());
app.use(cors());

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    logger.info(`Authenticating token: ${token}`);

    if (token == null) {
        logger.warn('No token provided');
        return res.sendStatus(401);
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            logger.error(`Token verification error: ${err.message}`);
            return res.sendStatus(403); // Invalid token
        }
        logger.info(`Token verified for user: ${user.userId}`);
        req.user = user;
        next();
    });
};

app.post('/updateUser', authenticateToken, async (req, res) => {
    const userId = req.user.userId; // Assuming userId is included in the JWT token
    const { fullName, email, color } = req.body;

    // Check if the new email is different from the user's current email and if it's already taken
    const usersRef = admin.database().ref('users');
    usersRef.orderByChild('email').equalTo(email).once('value', snapshot => {
        if (snapshot.exists()) {
            // Check if the found email belongs to the current user or another user
            const userKey = Object.keys(snapshot.val())[0];
            if(userKey !== userId) {
                // Email belongs to another user
                return res.status(400).send('This email is already taken by another user.');
            }
        }

        // If the email is not taken by another user or is the user's current email, proceed with update
        const updates = {};
        updates[`/users/${userId}/fullName`] = fullName;
        updates[`/users/${userId}/email`] = email;
        updates[`/users/${userId}/color`] = color;

        admin.database().ref().update(updates)
            .then(() => {
                res.status(200).send('User information updated successfully.');
            }).catch((error) => {
            logger.error("Error updating user information:", error);
            res.status(500).send('Error updating user information: ' + error);
        });
    }).catch(error => {
        logger.error("Database read error:", error);
        res.status(500).send(`Database read error: ${error}`);
    });
});

app.post('/createUser', async (req, res) => {
    const { fullName, email, password } = req.body;

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
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) {
                    logger.error("Error hashing password:", err);
                    return res.status(500).send('Error processing password');
                }
                // Create user data including the hashed password
                const userData = { fullName, email, password: hash, createdAt, role };

                // Assign a random color value
                userData.color = Math.floor(Math.random() * 7) + 1;
                userData.onboarding = false;
                userData.notifications = [];
                userData.projects = [];
                userData.docs = [];

                // Add the new user to the database
                admin.database().ref('users').push(userData)
                    .then((data) => {
                        // Retrieve and assign the Firebase-generated key as the userId
                        const userId = data.key;
                        admin.database().ref('users/' + userId).update({ userId })
                            .then(() => res.status(200).send('User created successfully'))
                            .catch((error) => {
                                logger.error("Error updating user with userId:", error);
                                res.status(500).send('Error updating user with userId: ' + error);
                            });
                    })
                    .catch((error) => {
                        logger.error("Error adding user data:", error);
                        res.status(500).send('Error adding user data: ' + error);
                    });
            });
        }
    });
});

app.post('/submitOnboardingAnswers', authenticateToken, async (req, res) => {
    const userId = req.user.userId; // Retrieve userId from JWT token
    const { userType, gender, dateOfBirth, phoneNumber, organizationName, organizationSize, projectType } = req.body;

    const userRef = admin.database().ref('users/' + userId);

    userRef.update({
        userType,
        gender,
        dateOfBirth,
        phoneNumber,
        organizationName,
        organizationSize,
        projectType,
        onboarding: true // Indicate that the onboarding process is complete
    }).then(() => {
        res.status(200).send('Onboarding information updated successfully');
    }).catch(error => {
        logger.error("Error updating onboarding information:", error);
        res.status(500).send('Error updating onboarding information: ' + error);
    });
});

app.post('/login', async (req, res) => {
    const { email, password, keepMeSignedIn } = req.body;

    const userRef = admin.database().ref('users').orderByChild('email').equalTo(email).limitToFirst(1);
    await userRef.once('value', snapshot => {
        if (snapshot.exists()) {
            const userData = Object.values(snapshot.val())[0];

            bcrypt.compare(password, userData.password, function (err, result) {
                if (err) {
                    return res.status(500).send('Authentication error');
                }
                if (result) {
                    const tokenExpiry = keepMeSignedIn ? process.env.KEEP_ME_SIGNED_IN_EXPIRY : process.env.TOKEN_EXPIRY;
                    const token = jwt.sign({
                        email: userData.email,
                        userId: userData.userId
                    }, process.env.JWT_SECRET, {expiresIn: tokenExpiry});

                    // Return the token to the client
                    res.status(200).json({message: 'Login successful', token});
                } else {
                    res.status(401).send('Incorrect password');
                }
            });
        } else {
            res.status(404).send('There is no user associated with that email address');
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

app.get('/getUser', authenticateToken, (req, res) => {
    const userId = req.user.userId; // Assuming this was included in the JWT

    const userRef = admin.database().ref('users').orderByChild('userId').equalTo(userId).limitToFirst(1);
    userRef.once('value', snapshot => {
        if (snapshot.exists()) {
            const userData = Object.values(snapshot.val())[0];
            // Create a copy of userData without the password
            const {password, ...userWithoutPassword} = userData;
            res.json(userWithoutPassword);
        } else {
            res.status(404).send('User not found');
        }
    }).catch(error => {
        res.status(500).send(`Database read failed: ${error}`);
    });
});

exports.app = functions.https.onRequest(app);
//firebase deploy --only functions