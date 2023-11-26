import bsky from '@atproto/api';
const { BskyAgent } = bsky;
import * as dotenv from 'dotenv';
import { CronJob } from 'cron';
import * as process from 'process';
import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js';
import fetch from "node-fetch";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
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
const supabaseTable = parseRequiredEnvWith(process.env.SUPABASE_DB_NAME, 'Need Supabase DB');
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
const gtfsFeed = parseRequiredEnvWith(process.env.ALERTS_URL, 'Need alert feed link');
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
function rssPostFormatter(update) {
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
        let post = rssPostFormatter(result.items[0]);
        console.log(`post: ${post}`);
        postAlertToBluesky(post);
    })();
}
function prepareAlert(entity) {
    const alert = entity.alert;
    const descriptions = alert.descriptionText.translation;
    const description = descriptions.find(trans => trans.language === process.env.LANGUAGE);
    const descriptionText = description.text;
    if (!descriptionText) {
        throw new Error(`Unexpected data:\n${entity}`, { cause: entity });
    }
    return {
        text: `${descriptionText}`,
        id: entity.id,
        alert: alert
    };
}
async function alertNotInDatabase(id) {
    const { data, error } = await supabase
        .from(supabaseTable)
        .select('*')
        .eq('id', id)
        .limit(1);
    if (error) {
        throw error;
    }
    return data.length == 0;
}
async function putAlertInDb(post) {
    const { error: insertError } = await supabase
        .from(supabaseTable)
        .insert([{
            text: post.text,
            id: post.id,
            entity: post.id
        }]);
    if (insertError) {
        throw insertError;
    }
}
// we can assume any entity that gets here is a well formed entity
// for safety purposes we will simply ignore any malformed entities and log them
function postGtfsAlert(entity) {
    console.log("in postGtfsAlert");
    const alert = prepareAlert(entity);
    // check for alert in database
    (async () => {
        if (await alertNotInDatabase(alert.id)) {
            putAlertInDb(alert);
            // formatGtfsAlert()
            postAlertToBluesky(alert.text.slice(0, 300)); // slice temporary while testing
        }
        else {
            console.log(`Alert ${alert.id} has already been posted`);
        }
    })();
}
// main logic for the regular service updates
function botUpdate() {
    console.log("running update");
    (async () => {
        let feed = await getGTFSData(gtfsFeed);
        if (!feed.entity.length) {
            console.log("No updates!");
        }
        else {
            console.log("Updates!");
            try {
                feed.entity
                    .filter((entity) => entity.hasOwnProperty('alert'))
                    .forEach((entity) => postGtfsAlert(entity));
            }
            catch (e) { // should probably use better logic for this
                console.log(e);
            }
        }
        // we should have logic for other types of realtime alerts
    })();
}
// Function to fetch GTFS realtime data
async function getGTFSData(gtfsUrl) {
    try {
        const response = await fetch(gtfsUrl);
        if (!response.ok) {
            const error = new Error(`${response.url}: ${response.status} ${response.statusText}`);
            error.cause = response;
            throw error;
        }
        const buffer = await response.arrayBuffer();
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
        return feed;
    }
    catch (e) {
        console.log(e);
        process.exit(1);
    }
}
async function postAlertToBluesky(postString) {
    const response = await agent.post({
        text: postString
    });
}
async function dropAlerts() {
    console.log("cleaning the DB");
    supabase
        .from(supabaseTable)
        .delete();
}
// Run this on a cron job
const scheduleExpressionProd = '*/2 5-23,0 * * *'; // Run once every 2 minutes during opening hours
const scheduleTableClean = '0 3 * * *'; // Run once every day at 03:00
const scheduleExpressionTest = '* * * * *'; // Run every minute
const postJob = new CronJob(scheduleExpressionProd, botUpdate);
const cleanJob = new CronJob(scheduleTableClean, dropAlerts);
postJob.start();
cleanJob.start();
// botUpdate();
