# bluesky-rss-bot

This is a simple bot that polls an RSS feed for the first item, and then posts it to Bluesky at a given interval. Currently, this is coded to work for the BART service alerts feed, but is easily modified to support any other RSS feeds by swapping the link and changing the ingest logic.

I will add more features later on, such as:
 * Dynamic cron job based on day of week (currently it's hard coded to BART's weekday opening hours)
 * Embedding a link into the post
 * Post deduplication, so it can be more like "post only new updates" rather than "post whatever's on top regularly"
 * Filesystem config file for controlling post frequency, format, etc
 * More?..

# Installation

This is a Typescript project. Install necessary packages with `npm install`.

To run this bot locally, create a `.env` file to set your username and password. Use the `.env.example` file as a guide.

Compile your Typescript `index.ts` file with `tsc -p .`. To run `index.js`, use `npm run start` or `node index.js`.

# Configuration

The .env.example file should be turned into your .env file, which defines a few key things for the bot to run properly:
 * BLUESKY_USERNAME: The username for the account you want the bot to run on
 * BLUESKY_PASSWORD: The password for the account you want the bot to run on
 * RSS_FEED: The RSS feed to pull from
 * SOURCE_LINK: The human-readable source for your RSS feed. example: the BART alerts website
 * NEWLINES_IN_POST: The number of newlines in the post, used for ensuring a post stays under the 300 character limit 
 
Updates may break this format down the line, if you end up forking the repo for your own use.

## Credit

Thank you to [aliceisjustplaying](https://github.com/aliceisjustplaying) for the [helpful template](https://github.com/aliceisjustplaying/atproto-starter-kit/)! 

Read Bluesky's documentation [here](https://github.com/bluesky-social/atproto/tree/main/packages/api).