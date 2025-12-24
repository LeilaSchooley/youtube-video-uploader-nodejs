require('dotenv').config();
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

let credentials = null;
try {
  credentials = require("./creds.json");
} catch (e) {
  // creds.json not present — falling back to environment variables
}

const { google } = require("googleapis");
const { oauth2 } = require("googleapis/build/src/apis/oauth2");
const multer = require("multer");
const router = express.Router();
const storage = multer.memoryStorage();
const stream = require("stream");
const upload = multer({ storage });
const csvParser = require("csv-parser");
const fs = require("fs");
const { auth } = require("googleapis/build/src/apis/abusiveexperiencereport");
const { parseDate } = require("./utils");

const CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || (credentials && credentials.web && credentials.web.client_id);
const CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || (credentials && credentials.web && credentials.web.client_secret);
const REDIRECT_URL =
  process.env.GOOGLE_REDIRECT_URI || (credentials && credentials.web && credentials.web.redirect_uris && credentials.web.redirect_uris[0]);

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URL) {
  console.warn('Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in .env or provide creds.json. OAuth routes will not work until configured.');
}

const oAuthClient = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URL
);

var authenticated = false;
var name = null;
var picture = null;
var scopes =
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/userinfo.profile";
var authTokens = null;

app.get("/", (req, res) => {
  if (!authenticated) {
    //Generate an auth url
    var url = oAuthClient.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
    });
    console.log(url, "oath generated");
    res.render("index", { url: url });
  } else {
    // user is authenticated
    var oath2 = google.oauth2({
      version: "v2",
      auth: oAuthClient,
    });

    oath2.userinfo.get((err, response) => {
      if (err) throw err;
      console.log(response.data);
      name = response.data.name;
      picture = response.data.picture;
      console.log(picture, 'sending pix')
      res.render("success", {
        name: name,
        picture: picture,
        success: false,
        error: false,
      });
    });
  }
});

// Middleware to check if oAuthClient has valid credentials
function ensureAuthenticated(req, res, next) {
  if (!oAuthClient.credentials || !oAuthClient.credentials.access_token) {
    // Redirect to Google login if credentials are missing or invalid
    return res.redirect("/");
  }
  next();
}

// Upload route
app.post("/upload", ensureAuthenticated, upload.single("video"), (req, res) => {
  const { title, description, privacyStatus, publishDate } = req.body;
  console.log(publishDate, 'publish date!!')
  // Validate privacy status
  if (!['public', 'private', 'unlisted'].includes(privacyStatus)) {
    return res.status(400).send("Invalid privacy status");
  }

  // Validate publish date if private
  // let publishAt = null;
  // if (privacyStatus === 'private') {
  //   if (!publishDate) {
  //     return res.status(400).send("Publish date required for private videos");
  //   }
  // }

  // YouTube API request body
  const requestBody = {
    snippet: { title, description },
    status: { privacyStatus }
  };

  if (privacyStatus === 'private' &&  publishDate) {
    if (new Date(publishDate) < new Date()) {
      return res.status(400).send("Publish date must be in the future");
    }
    requestBody.status.publishAt = new Date(publishDate).toISOString();
  }

  const file = req.file;
  if (!file) {
    return res.status(400).send("No video uploaded");
  }

  // Create a readable stream from the file buffer
  const videoStream = new stream.PassThrough();
  videoStream.end(file.buffer);

  console.log("requestBODY",  requestBody);
  const youtube = google.youtube({
    version: "v3",
    auth: oAuthClient,
  });

  //   Call the youtube apis
  youtube.videos.insert(
    {
      auth: oAuthClient,
      part: "snippet,status",
      requestBody,
      media: {
        body: videoStream,
      },
    },
    (err, data) => {
      if (err) {
        console.log(err.message, "Error while uploading");
        res.render("success", {
          name,
          picture,
          success: false,
          error: err.message || "Error while uploading video", // Optional
        });
      } else {
        res.render("success", {
          name,
          picture,
          success: "Video uploaded successfuly", // Optional
          error: false,
        });
      }
      console.log("uploading video done");
    }
  );
});

app.get("/logout", (req, res) => {
  authenticated = false;
  name, (picture = null);
  res.redirect("/");
});

// Redirect URL
app.get("/google/callback", (req, res) => {
  // exchange auth code with access token
  const code = req.query.code;
  if (code) {
    oAuthClient.getToken(code, (err, tokens) => {
      if (err) throw err;
      authTokens = tokens;
      console.log("authenticated successfuly");
      console.log(tokens, "tokens afer google login");
      oAuthClient.setCredentials(tokens);

      authenticated = true;
      res.redirect("/");
    });
  }
});

app.post("/upload-csv", upload.single("csvFile"), async (req, res) => {
  console.log('uplading csv')
  if (!req.file) {
     res
      .status(400)
      .json({ status: "error", message: "No CSV file uploaded" });
      return;
  }

  if (!authTokens) {
    res.redirect("/");
    return;
  }

  oAuthClient.setCredentials(authTokens);

  const csvData = [];
  const progress = [];
  const youtube = google.youtube({
    version: "v3",
    auth: oAuthClient,
  });
  // Parse the CSV file
  const csvStream = stream.PassThrough();
  csvStream.end(req.file.buffer);
  csvStream
    .pipe(csvParser())
    .on("data", (row) => {
      csvData.push(row);
    })
    .on("end", async () => {
      for (let i = 0; i < csvData.length; i++) {
        console.log(csvData[i], "csv data");
        const { title, description, thumbnail, video, scheduleTime, privacyStatus   } = csvData[i];
        progress.push({ index: i, status: "Uploading" }); // Parse flexible date formats
        console.log(privacyStatus, "privacyStatus");
        
           // Validate privacy status
    if (!['public', 'private', 'unlisted'].includes(privacyStatus)) {
      progress[i] = { status: "Invalid privacy status" };
      continue;
    }

 // Validate schedule time if private
 let parsedDate = null;
 if (privacyStatus === 'private') {
   parsedDate = parseDate(scheduleTime);
   if (!parsedDate || parsedDate < new Date()) {
     progress[i] = { status: "Invalid schedule time" };
     continue;
   }
 }
    
            // YouTube upload
    const requestBody = {
      snippet: { title, description },
      status: { privacyStatus }
    };

    if (privacyStatus === 'private' && parsedDate) {
      requestBody.status.publishAt = parsedDate.toISOString();
    }

        try {
          // Upload video
          const videoStream = fs.createReadStream(video);
          const resultVideoUpload = await youtube.videos.insert({
            auth: oAuthClient,
            part: "snippet,status",
            requestBody,
            media: { body: videoStream },
          });
          const videoId = resultVideoUpload.data.id;
          console.log(videoId, "the uploaded video");
          // Upload thumbnail (if provided)
          if (thumbnail && videoId) {
            console.log("Uploading thumbnail...");
            progress[i].status = "Uploading Thumbnail";
            const thumbnailStream = fs.createReadStream(thumbnail);
            await youtube.thumbnails.set({
              videoId: videoId,
              media: {
                body: thumbnailStream,
              },
            });
          }
          progress[i].status = "Uploaded";
        } catch (error) {
          console.error(`Error uploading video ${i + 1}:`, error.message);
          progress[i].status = `Failed: ${error.message}`;
        }
      }

      return res.json({ status: "success", progress });
    })
    .on("error", (err) => {
      console.error("Error parsing CSV:", err.message);
      res
        .status(500)
        .json({ status: "error", message: "Failed to parse CSV file" });
        return;
    });
});

app.set("view engine", "ejs");

app.listen(port, host, () => {
  console.log(`App listening at http://${host}:${port}`);
});
