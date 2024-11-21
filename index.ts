import bsky from '@atproto/api';
const { BskyAgent } = bsky;
import * as dotenv from 'dotenv';
import { CronJob } from 'cron';
import * as process from 'process';
import fetch from "node-fetch"
import GtfsRealtimeBindings from "gtfs-realtime-bindings"
import initSqlJs from 'sql.js';

dotenv.config();
const port = process.env.PORT || "8080";

// metafunction for parsing some env entry that may be undefined, and erroring if there is no entry
// this is for things like database URLs, passwords, etc.
function parseRequiredEnvWith(envEntry: string | undefined, errorMsg: string, parsingFunc: Function = String) {
  if (envEntry === undefined) {
    throw new Error(errorMsg)
  } else {
    return parsingFunc(envEntry)
  }
}
//sql.js
const SQL = await initSqlJs();
const db = new SQL.Database();
let db_init = "CREATE TABLE alerts (alert TEXT, id TEXT);"
db.run(db_init);

// Create a Bluesky Agent 
const agent = new BskyAgent({
  service: 'https://bsky.social',
});
await agent.login({
  identifier: process.env.BLUESKY_USERNAME!,
  password: process.env.BLUESKY_PASSWORD!,
});

// BART service alerts link -- will be used in future for adding hyperlink
// if you're forking this, change to a name more apt for your use case
const serviceAlertLink = process.env.SOURCE_LINK;
// RSS feed link
// TO-DO: make not having a link be an error
const rssFeed = parseRequiredEnvWith(process.env.RSS_FEED, 'Need RSS feed link')
const gtfsFeed = parseRequiredEnvWith(process.env.ALERTS_URL, 'Need alert feed link')

const postCharLimit = 300;

const newlinesInPost = (_ => {
  if (process.env.NEWLINES_IN_POST === undefined) {
    return 0
  } else {
    let count = parseInt(process.env.NEWLINES_IN_POST)
    if (Number.isNaN(count)) {
      console.log("NEWLINES_IN_POST is not a valid number -- defaulting to 0")
      return 0
    } else {
      return count
    }
  }
})()

// post database
// when new headline is here, pull the isodate and compare to 

// Function to format the latest headline as a post
// Must include a case for if the post is longer than 300 characters
function rssPostFormatter(update): string {
  console.log("Running postFormatter...");
  let verboseLength = update.content.length + update.pubDate.length
  let condensedLength = update.contentSnippet.length + update.pubDate.length

  // bluesky allows posts 300 characters or less
  // TO-DO: embed service link into the post as a link card
  console.log(update)
  if ((verboseLength + newlinesInPost) <= postCharLimit) {
    return `${update.content}\n\n${update.pubDate}`
  } else if ((condensedLength + newlinesInPost) <= postCharLimit) {
    return `${update.contentSnippet}\n\n${update.pubDate}`
  } else {
    console.log("This could have been an error. Verify:")
    console.log(`verboseLength: ${verboseLength}`)
    console.log(`condensedLength: ${condensedLength}`)
    return `An alert too long to fit in a Bluesky post is available at ${serviceAlertLink}`
  }
}

function prepareAlert(entity: GtfsRealtimeBindings.transit_realtime.IFeedEntity) {
  const alert = entity.alert!
  const descriptions = alert.descriptionText!.translation!;
  const description = descriptions.find(trans => trans.language === process.env.LANGUAGE)!;
  const descriptionText = description.text;
  if (!descriptionText) {
    throw new Error(`Unexpected data:\n${entity}`, { cause: entity });
  }
  return {
    alert: `${descriptionText}`,
    id: entity.id,
  }
}

function alertNotInDatabase(id): Boolean {
  const find_identical_alert = db.prepare("SELECT * from alerts where id == ?");
  const result = find_identical_alert.getAsObject([id]);
  console.log(result);

  return result.id != id;
}

function putAlertInDb(post) {
  const putAlertStmt = db.prepare("INSERT INTO alerts VALUES (?, ?)");
  putAlertStmt.run([post.alert, post.id]);
}

// we can assume any entity that gets here is a well formed entity
// for safety purposes we will simply ignore any malformed entities and log them
function postGtfsAlert(entity: GtfsRealtimeBindings.transit_realtime.IFeedEntity) {
  console.log("in postGtfsAlert");
  const alert = prepareAlert(entity);
  // check for alert in database
  (async () => {
    if (alertNotInDatabase(alert.id)) {
      putAlertInDb(alert)
      // formatGtfsAlert()
      postAlertToBluesky(alert.alert.slice(0, 300)); // slice temporary while testing
    } else {
      console.log(`Alert ${alert.id} has already been posted`)
    }
  })()
}

// main logic for the regular service updates
function botUpdate() {
  console.log("running update");
  (async () => {
    let feed = await getGTFSData(gtfsFeed);
    if (!feed.entity.length) {
      console.log("No updates!")
    } else {
      console.log("Updates!")
      try {
        feed.entity
          .filter((entity) => entity.hasOwnProperty('alert'))
          .forEach((entity) => postGtfsAlert(entity));

      } catch (e) {// should probably use better logic for this
        console.log(e)
      }
    }
    // we should have logic for other types of realtime alerts
  })()
}

// Function to fetch GTFS realtime data
async function getGTFSData(gtfsUrl: string): Promise<GtfsRealtimeBindings.transit_realtime.FeedMessage> {
  try {
    const response = await fetch(gtfsUrl)
    if (!response.ok) {
      const error = new Error(`${response.url}: ${response.status} ${response.statusText}`);
      error.cause = response;
      throw error;
    }
    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );
    return feed
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
}

async function postAlertToBluesky(postString: string): Promise<void> {
  const response = await agent.post({
    text: postString
  });

}

async function dropAlerts() {
  db.run("DELETE FROM alerts")
}

// Run this on a cron job
const scheduleExpressionProd = '*/1 5-23,0 * * *'; // Run once every 2 minutes during opening hours
const scheduleTableClean = '0 3 * * *' // Run once every day at 03:00
const scheduleExpressionTest = '* * * * *'; // Run every minute

const postJob = new CronJob(scheduleExpressionProd, botUpdate);
const cleanJob = new CronJob(scheduleTableClean, dropAlerts);
postJob.start();
cleanJob.start();
// botUpdate();
