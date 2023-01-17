const { App } = require('@slack/bolt');
const { google } = require('googleapis');
const { initTables, getFile, setFile } = require('./db');
const { authenticate, generateAuthUrl, getUserOAuthClient, isAuthed } = require('./oauth2');
const request = require('request');
const fs = require('fs');
var appRoot = require('app-root-path');
const slackKeys = require(appRoot + '/secrets/slack.keys.json');

// `/files` is a directory where we will temporarily store files from slack
const fileDir = appRoot + '/files/';
if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir);
}

// In order to reach Slack via a local server, we need to use Socket Mode.
// You can enable socket mode by setting the environment variable LOCAL=true
// and enabling Socket Mode in your app configuration. 
const socketMode = process.env.LOCAL ? true : false;

// List of file types which may contain sensitive information
// and will trigger a request to upload to Google Drive
const fileTypes =  [
    'pdf',
    'csv',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'txt',
    'rtf',
    'odt',
    'ods',
    'odp',
    'zip'
];


const app = new App({
    token: slackKeys.SLACK_BOT_TOKEN,
    signingSecret: slackKeys.SLACK_SIGNING_SECRET,
    appToken: slackKeys.SLACK_APP_TOKEN,
    socketMode: socketMode,
    customRoutes: [
        {
            path: '/health-check',
            method: ['GET'],
            handler: (req, res) => {
                res.writeHead(200);
                res.end("👋 Hello! I'm healthy");
            }
        },
        {
            path: '/oauth2callback',
            method: ['GET'],
            handler: async (req, res) => {

                const qs = new URL(req.url, 'http://localhost:8080').searchParams;
                const code = qs.get('code')

                // get the user id from the state
                const userId = qs.get('state')

                await authenticate(userId, code);
                res.end('Authentication successful! Feel free to close this window and return to slack.');
            }
        }
    ]
});

async function downloadFileFromSlack(url) {
    /*
    Downloads a file from slack and stores it in the './files' directory
    Returns the file name
    */
    const fileName = url.split('/').pop();
    const filePath = fileDir + fileName;

    const options = {
        url: url,
        headers: {
            'Authorization': 'Bearer ' + slackKeys.SLACK_BOT_TOKEN
        }
    };

    // create a new Promise so that we can wait for the file to download
    return new Promise((resolve, reject) => {
        const stream = request(options).pipe(fs.createWriteStream(filePath));
        stream.on('finish', () => {
            console.log("file finished downloading")
            resolve(fileName);
        });

        stream.on('error', (err) => {
            reject(err);
        });
    });
}

async function uploadFileToGDrive(drive, fileName, emails) {
    /*
    Uploads a file to google drive and shares it with the users in the emails array
    Returns the google drive URL
    */

    // check if 'slackurity' folder exists and if not, create it
    const folderList = await drive.files.list({
        q: "name='slackurity Files' and mimeType='application/vnd.google-apps.folder'"
    });
    
    var folderId = null;
    if (folderList.data.files.length == 0) {
        const folderRes = await drive.files.create({
            requestBody: {
                name: 'Slackurity Files',
                mimeType: 'application/vnd.google-apps.folder'
            }
        });
        folderId = folderRes.data.id;
    } else {
        folderId = folderList.data.files[0].id;
    }

    // upload file to google drive folder
    const uploadRes = await drive.files.create({
        requestBody: {
            name: fileName,
            parents: [folderId]
        },
        media: {
            body: fs.createReadStream(
                fileDir + fileName
            )
        }
    });

    // share file with all users in email array
    promises = [];
    for (let i = 0; i < emails.length; i++) {
        promises.push(drive.permissions.create({
            fileId: uploadRes.data.id,
            requestBody: {
                role: 'reader',
                type: 'user',
                emailAddress: emails[i]
            }
        }));        
    }
    await Promise.all(promises);

    // delete the file from the server
    fs.unlinkSync(fileDir + fileName);

    // return the google drive URL
    return "https://drive.google.com/file/d/" + uploadRes.data.id + "/view?usp=sharing";

}

app.event('file_public', async ({ event, client }) => {
    /*
    This event is triggered when a file is shared publicly in a channel
    this function will check if the file is of a type we want to secure
    if so, it will ask the user if they want to upload it to google drive.
    It stores the file ID and message ID in the database so that we can
    refer to it later when the user responds to the ephemeral message
    */

    try {

        // get file info
        const file = await client.files.info(
            {
                file: event.file_id
            }
        );

        // check if file is of a type we want to secure
        const fileType = file.file.name.split('.').pop();
        if (!fileTypes.includes(fileType)) {
            return;
        }

        // check if file is already in the database
        const fileInDb = await getFile(file.file.id);
        if (fileInDb) {
            return;
        }

        // get channel ID
        const channelId = file.file.channels[0];

        // send a Ephemeral message to the user in the channel asking if they want to download the file. Yes or no button
        const msg = await client.chat.postEphemeral({
            channel: channelId,
            user: event.user_id,
            text: `Do you want to download this file?`,
            blocks: [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "Hi :wave:"
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "I see that you shared a potentially sensitive document. It's typically good security practice to keep these files in a secure location such as Google Drive.\n\nGoogle Drive is signifantly more secure because:"
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "• It handles auth sessions more securely \n • It has a granular permission structure \n • Your security team has much better visbility and control over GDrive than Slack"
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "*I can upload the file to your GDrive for you and share it with everyone in this channel.* Would you like me to do that?"
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "Yes",
                                "emoji": true
                            },
                            "style": "primary",
                            "value": "yes_button",
                            "action_id": "yes_action"
                        },
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "No",
                                "emoji": true
                            },
                            "style": "danger",
                            "value": "no_button",
                            "action_id": "no_action"
                        }
                    ]
                }
            ]
        });

        setFile(msg.message_ts, file.file.id, file.file.url_private_download)

    } catch (error) {
        console.log("ERROR: " + error);
    }
});

app.action('yes_action', async ({ ack, respond, say, body, client}) => {
    /*
    This function is triggered when the user clicks the 'yes' button in the ephemeral message
    It will download the file from slack, upload it to google drive and share it with the users in the slack channel
    */

    ack();

    // get user authClient
    const authClient = await getUserOAuthClient(body.user.id);

    // if user has not authenticated with google drive, send them a link to authenticate
    if (!authClient) {
        client.chat.postEphemeral({
            channel: body.channel.id,
            user: body.user.id,
            text: "Please authenticate with Google Drive by typing the slack command `/secure login`"
        });
        return;
    }

    const drive = google.drive({ version: 'v3', auth: authClient });

    var msg = "Downloading file from Slack...";
    respond(msg)

    // get and download the file from slack
    const fileDetails = await getFile(body.container.message_ts);
    const filePath = await downloadFileFromSlack(fileDetails.file_url); 

    msg += " ✅\nGetting users in channel...";
    respond(msg)
    // get all users in channel
    const users = await client.conversations.members(
        {
            channel: body.channel.id
        }
    );

    // get all user emails
    const emails = [];

    for (let i = 0; i < users.members.length; i++) {
        const userInfo = await client.users.info(
            {
                user: users.members[i]
            }
        );
        
        email = userInfo.user.profile.email;
        if (email) {
            emails.push(email);
        }
    }

    // upload  to GDrive and delete the file from slack
    msg += " ✅\nUploading file to Google Drive...";
    respond(msg)
    const driveURL = await uploadFileToGDrive(drive, filePath, emails);

    msg += " ✅\nDeleting file from Slack...";
    respond(msg)
    // delete the file
    deleteFile = await client.files.delete(
        {
            file: fileDetails.file_id,
            token: slackKeys.SLACK_USER_TOKEN
        }
    );

    msg += " ✅\nDone! Posting the link in the channel...";
    respond(msg);

    // send a message to the channel with the google drive URL
    say("File shared by <@" + body.user.id + ">: " + driveURL);

});

app.action('no_action', async ({ ack, respond, say }) => {
    // Acknowledge the action
    await ack();
    await respond('roger that 🫡');

   
});

app.command('/secure', async ({ command, ack, respond}) => {
    /*
    This function is triggered when the user types the slack command `/secure login`
    It will generate a link for the user to authenticate with google drive
    */

    ack();

    // check if text is login. If not, return
    if (command.text !== 'login') {
        return;
    }

    // check if user is already authenticated
    user = await isAuthed(command.user_id);
    if (user) {
        respond("You are already authenticated!");
        return;
    }

    const authorizeUrl = await generateAuthUrl(
        command.user_id,
        ['https://www.googleapis.com/auth/drive.file'],
    );

    respond("<" + authorizeUrl + "|Please click here to authorize Secure to use Google Drive>");
});

// Starts the app
(async () => {
    // initTables checks if the required tables exist and if not creates them
    await initTables()

    // Start your app
    await app.start(process.env.PORT || 8080);

    console.log('⚡️ Bolt app is running!');
})();