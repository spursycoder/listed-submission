const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const express = require("express");
const app = express();
const port = 3000;

let repliedThreads = [];

const SCOPES = ["https://mail.google.com/"];
const TOKEN_PATH = "token.json";

const credentials = JSON.parse(fs.readFileSync("client_secret.json"));

const oAuth2Client = new google.auth.OAuth2(
	credentials.installed.client_id,
	credentials.installed.client_secret,
	credentials.installed.redirect_uris[0]
);

function authorizeUrl() {
	return oAuth2Client.generateAuthUrl({
		access_type: "offline",
		scope: SCOPES,
	});
}

app.get("/", (req, res) => {
	console.log("Redirecting to Google API");
	const url = authorizeUrl();
	res.redirect(url);
});

app.get("/auth/callback", async (req, res) => {
	console.log("Authenticating with Google API");
	const code = req.query.code;
	try {
		const { tokens } = await oAuth2Client.getToken(code);
		oAuth2Client.setCredentials(tokens);
		console.log("Successfully authenticated with Google API");
		fs.writeFile(TOKEN_PATH, JSON.stringify(tokens), (err) => {
			if (err) return console.error(err);
			console.log(`Token stored in ${TOKEN_PATH}`);
		});
		setInterval(async () => {
			const unread = await checkForNewEmails();
			console.log("Unread mesaages: recieved");
			sendReply(unread);
		}, getRandomInterval());
		res.send("Successfully authenticated with Google API");
	} catch (err) {
		console.error("Error retrieving access token", err);
		res.status(500).send("Error retrieving access token");
	}
});

async function sendReply(unread) {
	const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
	console.log("Sending reply");
	for (const message of unread) {
		if (hasNotReplied(message.threadId)) {
			try {
				//label the thread
				const label = await gmail.users.messages.modify({
					userId: "me",
					id: message.threadId,
					resource: { addLabelIds: ["STARRED"] },
				});
				console.log(label);
				//send reply to thread.id
				const reply = await gmail.users.messages.send({
					userId: "me",
					requestBody: {
						raw: Buffer.from("Reply").toString("base64"),
						threadId: message.threadId,
					},
				});
				console.log(reply);
			} catch (error) {
				console.error(`Gmail API error: ${error}`);
				console.error(error.stack);
			}
		}
	}
}

async function checkForNewEmails() {
	const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

	const response = await gmail.users.messages.list({
		userId: "me",
		q: "is:unread -category:(promotions OR social)",
	});

	const messages = response.data.messages;
	console.log(messages);
	if (messages.length > 0) {
		console.log(`You have ${messages.length} unread emails!`);
	}
	return messages;
}

async function hasNotReplied(threadId) {
	if (repliedThreads.includes(threadId)) {
		return false;
	} else {
		repliedThreads.push(threadId);
		return true;
	}
}

function getRandomInterval() {
	const min = 45000; // 45 seconds
	const max = 120000; // 120 seconds
	return Math.floor(Math.random() * (max - min + 1) + min);
}

app.listen(port, () => {
	console.log(`App listening at http://localhost:${port}`);
});
