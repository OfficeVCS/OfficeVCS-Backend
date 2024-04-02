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

admin.initializeApp();
const app = express();

app.use(cors);

app.use(express.json());

app.post('/createProduct', async (req, res) => {
    const data = req.body;

    admin.database().ref('products').push(data)
        .then(() => {
            res.status(200).send('New Product Created');
        })
        .catch((error) => {
            logger.error("Error adding data:", error);
            res.status(500).send('Error adding data: ' + error);
        });
});

exports.app = functions.https.onRequest(app);
//firebase deploy --only functions