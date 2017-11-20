const fs = require('fs'),
    https = require('https'),
    express = require('express'),
    app = express(),
    EventorSync = require('./src/eventor-sync');

const args = process.argv.slice(2);
const apiKey = args[0];
const organisationId = args[1];

if (!apiKey || !organisationId) {
    console.log("Usage: node eventor-sync <API_KEY> <ORGANISATION_ID>");
    return;
}

const eventorSync = new EventorSync({
    apiKey: apiKey
});

https.createServer({
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
}, app).listen(55555);

app.get('/sync', function (req, res) {

    eventorSync.syncPersons(organisationId)
        .then(() => {
            return res.send('Persons synched');
        })
        .catch(err => {
            res.status(500).send(err);
        });
});