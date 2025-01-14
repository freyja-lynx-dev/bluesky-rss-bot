import bsky from '@atproto/api';
const { BskyAgent } = bsky;
import * as dotenv from 'dotenv';
import { CronJob } from 'cron';
import * as process from 'process';
import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js';
dotenv.config();
const port = process.env.PORT || "8080";
let parser = new Parser();
// metafunction for parsing some env entry that may be undefined, and erroring if there is no entry
// this is for things like database URLs, passwords, etc.
function parseRequiredEnvWith(envEntry, errorMsg, parsingFunc = String) {
    if (envEntry === undefined) {
        throw new Error(errorMsg);
    }
    else {
        return parsingFunc(envEntry);
    }
}
// Create a single supabase client
const supabaseURL = parseRequiredEnvWith(process.env.SUPABASE_URL, 'Need Supabase URL');
const supabasePublicKey = parseRequiredEnvWith(process.env.SUPABASE_PUBLIC_KEY, 'Need Supabase Pubkey');
const supabase = createClient(supabaseURL, supabasePublicKey);
// Create a Bluesky Agent 
const agent = new BskyAgent({
    service: 'https://bsky.social',
});
await agent.login({
    identifier: process.env.BLUESKY_USERNAME,
    password: process.env.BLUESKY_PASSWORD,
});
// BART service alerts link -- will be used in future for adding hyperlink
// if you're forking this, change to a name more apt for your use case
const serviceAlertLink = process.env.SOURCE_LINK;
// RSS feed link
// TO-DO: make not having a link be an error
const rssFeed = parseRequiredEnvWith(process.env.RSS_FEED, 'Need RSS feed link');
const postCharLimit = 300;
const newlinesInPost = (_ => {
    if (process.env.NEWLINES_IN_POST === undefined) {
        return 0;
    }
    else {
        let count = parseInt(process.env.NEWLINES_IN_POST);
        if (Number.isNaN(count)) {
            console.log("NEWLINES_IN_POST is not a valid number -- defaulting to 0");
            return 0;
        }
        else {
            return count;
        }
    }
})();
// post database
// when new headline is here, pull the isodate and compare to 
// Function to format the latest headline as a post
// Must include a case for if the post is longer than 300 characters
function postFormatter(update) {
    console.log("Running postFormatter...");
    let verboseLength = update.content.length + update.pubDate.length;
    let condensedLength = update.contentSnippet.length + update.pubDate.length;
    // bluesky allows posts 300 characters or less
    // TO-DO: embed service link into the post as a link card
    console.log(update);
    if ((verboseLength + newlinesInPost) <= postCharLimit) {
        return `${update.content}\n\n${update.pubDate}`;
    }
    else if ((condensedLength + newlinesInPost) <= postCharLimit) {
        return `${update.contentSnippet}\n\n${update.pubDate}`;
    }
    else {
        console.log("This could have been an error. Verify:");
        console.log(`verboseLength: ${verboseLength}`);
        console.log(`condensedLength: ${condensedLength}`);
        return `An alert too long to fit in a Bluesky post is available at ${serviceAlertLink}`;
    }
}
// parse the rss feed once
async function rssParse(linkToParse) {
    return await parser.parseURL(linkToParse);
}
// Function to print an update from the RSS feed
// Concern -- how do we make sure it's not identical to the last update?
// One way -- when pulling in the latest headline, create it as an object and compare to objects in the list
function rssUpdate() {
    console.log("Running rssUpdate...");
    // TO-DO: What if the RSS query fails?
    (async () => {
        let result = await rssParse(rssFeed);
        let post = postFormatter(result.items[0]);
        console.log(`post: ${post}`);
        postAlertToBluesky(post);
    })();
}
async function postAlertToBluesky(postString) {
    const response = await agent.post({
        text: postString
    });
}
// Run this on a cron job
const scheduleExpressionProd = '*/30 5-23,0 * * *'; // Run once every thirty minutes during opening hours
const scheduleExpressionTest = '* * * * *'; // Run every minute
const job = new CronJob(scheduleExpressionProd, rssUpdate);
job.start();
