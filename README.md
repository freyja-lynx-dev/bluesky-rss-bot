# bluesky-BART-Alerts-bot

This bot pulls information from the BART GTFS realtime feed and serves it to users on Bluesky. Planned feature list:
 * Regular service alert updates published to Bluesky
 * Line-specific and station-specific updates on user request, including real-time arrival updates
 * ???

 This may just work for other transit feeds? Will not guarantee, merely suggest.


# Installation

This is a Typescript project. Install necessary packages with `npm install`.

To run this bot locally, create a `.env` file to set your username and password. Use the `.env.example` file as a guide.

Compile your Typescript `index.ts` file with `tsc -p .`. To run `index.js`, use `npm run start` or `node index.js`.

# Configuration

The .env.example file should be turned into your .env file, which defines a few key things for the bot to run properly:
 * BLUESKY_USERNAME: The username for the account you want the bot to run on
 * BLUESKY_PASSWORD: The password for the account you want the bot to run on
 * GTFS_FEED: The GTFS feed to pull from
 * SOURCE_LINK: The human-readable source for your GTFS feed. example: the BART alerts website
 * NEWLINES_IN_POST: The number of newlines in the post, used for ensuring a post stays under the 300 character limit 
 
Updates may break this format down the line, if you end up forking the repo for your own use.

## Credit

Thank you to [aliceisjustplaying](https://github.com/aliceisjustplaying) for the [helpful template](https://github.com/aliceisjustplaying/atproto-starter-kit/)! 

Read Bluesky's documentation [here](https://github.com/bluesky-social/atproto/tree/main/packages/api).