const express = require('express');
const router = express.Router();
const fs = require('fs');
const { google } = require('googleapis');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

// Set up Google Calendar API and SendGrid
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = 'token.json';
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Helper function to authorize Google OAuth2 client
function authorize(callback) {
  // Load client secrets from a local file
  fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    
    const { client_secret, client_id, redirect_uris } = JSON.parse(content).installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));
      callback(oAuth2Client);
    });
  });
}

// Helper function to get access token
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this URL:', authUrl);
  // Implement a way to get the token from user input or via redirect URL (e.g. through frontend)
}

// Route to render calendar events page
router.get('/', (req, res) => {
  res.render('calender.ejs');
});

// Route to fetch Google Calendar events
router.post('/', (req, res) => {
  const tkn = req.body.token; // Get token from user input
  
  authorize(oAuth2Client => {
    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    // Fetch the list of events from user's primary calendar
    calendar.events.list({
      calendarId: 'primary',
      timeMin: (new Date()).toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    }, (err, result) => {
      if (err) return console.log('The API returned an error: ' + err);
      
      const events = result.data.items;
      const eventArr = events.length ? events.map(event => `${event.start.dateTime || event.start.date} - ${event.summary}`) : ['No upcoming events found.'];
      
      res.render('../views/calendar.ejs', { events: eventArr });
    });
  });
});

// Route to add an event and send notification email
router.post('/events', (req, res) => {
  const { summary, description, to } = req.body; // Capture event details and email recipient

  const oAuth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET);
  oAuth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });

  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  // Define event start and end times
  const eventStartTime = new Date();
  eventStartTime.setDate(eventStartTime.getDate() + 2); // Event starts in 2 days
  
  const eventEndTime = new Date();
  eventEndTime.setDate(eventEndTime.getDate() + 2); 
  eventEndTime.setMinutes(eventEndTime.getMinutes() + 60); // Event duration is 1 hour
  
  // Define event object for Google Calendar
  const event = {
    summary: summary,
    description: description,
    colorId: 6, // Choose a color for the event
    start: {
      dateTime: eventStartTime,
      timeZone: 'America/Los_Angeles', // Set the appropriate time zone
    },
    end: {
      dateTime: eventEndTime,
      timeZone: 'America/Los_Angeles',
    },
  };

  // Insert event into Google Calendar
  calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  }, (err) => {
    if (err) return console.error('Error creating Calendar event: ', err);
    console.log('Event created successfully.');
    
    // Send email notification via SendGrid
    const msg = {
      to: to,
      from: 'your-email@example.com', // Verified sender email
      subject: summary,
      text: description,
      html: `<strong>${description}</strong>`,
    };
    
    sgMail.send(msg)
      .then(() => console.log('Email sent'))
      .catch((error) => console.error(error));
    
    res.render('../views/events.ejs'); // Render success view
  });
});

module.exports = router;

