import { Client } from "@notionhq/client";

// Define "require"
import { createRequire } from "module";
const require = createRequire(import.meta.url);


require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");


const {TOKEN, SERVER_URL, NOTION_KEY, NOTION_DATABASE_ID} = process.env;
const TELEGRAM_API=`https://api.telegram.org/bot${TOKEN}`;
const URI = `/webhook/${TOKEN}`;
const WEBHOOK_URL = SERVER_URL+URI;


const notion = new Client({ auth: NOTION_KEY });



const app = express();
app.use(bodyParser.json());


function objDate(notionInfo) {
  const temp = notionInfo.split(":");
  temp.splice(-1,1) //trim the last : cuz i don't need it empty obj key
  const obj = {}
  let i = 0;
  while (i < temp.length) {
    if(i+1 == temp.length) break;
    obj[temp[i]] = temp[i + 1].trim();
    i += 2;
  }

  return obj;
}



const init = async()=> {
  const res = await axios.get(`${TELEGRAM_API}/setWebhook?url=${WEBHOOK_URL}`);
  console.log(res.data);
}



app.post(URI, async(req, res)=>{
  //Only if there is channel post
  if ('message' in req.body) {

    let t = req.body.message.text;
    // ignore texts without props and the equals to seprate from props and blurb
    if (t.includes("===") && (t.includes("Name") || t.includes("Opportunity Type") || t.includes("Deadline") || t.includes("Website") || t.includes("YouTube Video"))) {

      let firstEqualIndex;
      let notionInfo = Array.from(t);

      notionInfo.forEach((item, index)=>{
          if(item == "=" && notionInfo[index-1] != "=") {           //first equal
            firstEqualIndex = index;
          } else if (item == "=" && notionInfo[index+1] != "=") {   //Cut equals
            t = notionInfo.splice(index+1, (notionInfo.length-1)-(index+1)+1).join("").toString().trim();
            notionInfo.splice(firstEqualIndex, index-firstEqualIndex+1);
          } else if (index == notionInfo.length-1) console.log(item);
          if (/\r|\n/.exec(item)) {
             notionInfo[index] = `:`; //the algo i made split by :
           }
        })
      notionInfo = (notionInfo.join("").toString());

      notionInfo = removeHttp(notionInfo.toLocaleLowerCase());
      notionInfo = noColon(notionInfo)
      notionInfo = objDate(notionInfo);

      for (const key of Object.keys(notionInfo)) {
        //null empty inputs==propper for notion
        if(notionInfo[key].length == 0) {
          notionInfo[key] = null;
        }
        //deadline into ISO...propper for notoin
        if(key=="deadline" && notionInfo[key] != null) {
          notionInfo[key] = datespaces(notionInfo[key].toLowerCase());
          let d = new Date(notionInfo[key]);
          if (d.toString() === 'Invalid Date') {
            console.error("Date Error");
            return res.send();
          }
          d.setTime(d.getTime() - (d.getTimezoneOffset() * 60000));
          notionInfo[key] = d.toISOString().split('T')[0];
        }
      }

      //DIDN'T FIND ANY APIs EASY METHOD TO CHECK THE INPUTS IN TELEGRAM message SO I TURN IT MANUALLY
      if (!notionInfo.hasOwnProperty("name")) notionInfo["name"] = null;
      if (!notionInfo.hasOwnProperty("opportunity type")) notionInfo["opportunity type"] = null;
      if (!notionInfo.hasOwnProperty("deadline")) notionInfo["deadline"] = null;
      if (!notionInfo.hasOwnProperty("website")) notionInfo["website"] = null;
      if (!notionInfo.hasOwnProperty("youtube video")) notionInfo["youtube video"] = null;

      controls(notionInfo, t);

    }
  }
  return res.send();

})




app.listen(process.env.PORT || 5000, async ()=>{
  console.log("App is running on port", process.env.PORT || 5000);
  await init()
});




//CONTROL THE ADDs
function controls(notionInfo, t) {
  if (notionInfo["name"] != null && notionInfo["opportunity type"] != null && notionInfo["deadline"] != null) {
    add(notionInfo["name"], notionInfo["opportunity type"], notionInfo["deadline"], notionInfo["website"], notionInfo["youtube video"], t);
  }
  else if (notionInfo["name"] != null && notionInfo["opportunity type"] != null && notionInfo["deadline"] == null) {
    addWODead(notionInfo["name"], notionInfo["opportunity type"], notionInfo["website"], notionInfo["youtube video"], t);
  }
  else if (notionInfo["name"] != null && notionInfo["opportunity type"] == null && notionInfo["deadline"] != null) {
    addWOOpp(notionInfo["name"], notionInfo["deadline"], notionInfo["website"], notionInfo["youtube video"], t);
  }
  else if (notionInfo["name"] == null && notionInfo["opportunity type"] != null && notionInfo["deadline"] != null) {
    addWOName(notionInfo["opportunity type"], notionInfo["deadline"], notionInfo["website"], notionInfo["youtube video"], t);
  }

  else if (notionInfo["name"] != null && notionInfo["opportunity type"] == null && notionInfo["deadline"] == null) {
    addWOOppDead(notionInfo["name"], notionInfo["website"], notionInfo["youtube video"], t);
  }
  else if (notionInfo["name"] == null && notionInfo["opportunity type"] != null && notionInfo["deadline"] == null) {
    addWONameDead(notionInfo["opportunity type"], notionInfo["website"], notionInfo["youtube video"], t);
  }
  else if (notionInfo["name"] == null && notionInfo["opportunity type"] == null && notionInfo["deadline"] == null) {
    addWONameOppDead(notionInfo["website"], notionInfo["youtube video"], t);
  }
}



//DIDN'T FIND ANY APIs EASY METHOD TO CHECK THE INPUTS IN TELEGRAM message SO I TURN IT MANUALLY
async function add(name, oppType, deadline, website, youVideo, blurb) {
  try {
    const response = await notion.pages.create({
      parent:{database_id: NOTION_DATABASE_ID},
      properties: {
        title: {
          type: "title",
          title: [{
              type: "text",
              text: {
                content: name
              }
          }],
        },
        "Blurb": {
          rich_text: [{
            type: "text",
            text: {
              content: blurb,
            }
          }],
        },
        "Opportunity Type": {
          type: "select",
          select: {
            name: oppType
          }
        },
        "Deadline": {
          type: "date",
          date: {
            start: deadline
          }
        },
        "Website": {
          type: "url",
          url: website
        },
        "Youtube Video": {
          type: "url",
          url: youVideo
        },
      }
    })
    console.log("Success! Entry added.")
  } catch (error) {
    console.error(error.body)
  }
}

async function addWODead(name, oppType, website, youtubevideo, blurb) {
  try {
    const response = await notion.pages.create({
      parent:{database_id: NOTION_DATABASE_ID},
      properties: {
        title: {
          type: "title",
          title: [{
              type: "text",
              text: {
                content: name
              }
          }],
        },
        "Blurb": {
          rich_text: [{
            type: "text",
            text: {
              content: blurb,
            }
          }],
        },
        "Opportunity Type": {
          type: "select",
          select: {
            name: oppType
          }
        },
        "Deadline": {
          type: "date",
          date: null
        },
        "Website": {
          type: "url",
          url: website
        },
        "Youtube Video": {
          type: "url",
          url: youtubevideo
        },
      }
    })
    console.log("Success! Entry added.")
  } catch (error) {
    console.error(error.body)
  }
}

async function addWOOpp(name, deadline, website, youtubevideo, blurb) {
  try {
    const response = await notion.pages.create({
      parent:{database_id: NOTION_DATABASE_ID},
      properties: {
        title: {
          type: "title",
          title: [{
              type: "text",
              text: {
                content: name
              }
          }],
        },
        "Blurb": {
          rich_text: [{
            type: "text",
            text: {
              content: blurb,
            }
          }],
        },
        "Opportunity Type": {
          type: "select",
          select: null
        },
        "Deadline": {
          type: "date",
          date: {
            start: deadline
          }
        },
        "Website": {
          type: "url",
          url: website
        },
        "Youtube Video": {
          type: "url",
          url: youtubevideo
        },
      }
    })
    console.log("Success! Entry added.")
  } catch (error) {
    console.error(error.body)
  }
}

async function addWOName(oppType, deadline, website, youtubevideo, blurb) {
  try {
    const response = await notion.pages.create({
      parent:{database_id: NOTION_DATABASE_ID},
      properties: {
        "Opportunity Type": {
          type: "select",
          select: {
            name: oppType
          }
        },
        "Blurb": {
          rich_text: [{
            type: "text",
            text: {
              content: blurb,
            }
          }],
        },
        "Deadline": {
          type: "date",
          date: {
            start: deadline
          }
        },
        "Website": {
          type: "url",
          url: website
        },
        "Youtube Video": {
          type: "url",
          url: youtubevideo
        },
      }
    })
    console.log("Success! Entry added.")
  } catch (error) {
    console.error(error.body)
  }
}

//TWO OR MORE NULLS
async function addWOOppDead(name, website, youtubevideo, blurb) {
  try {
    const response = await notion.pages.create({
      parent:{database_id: NOTION_DATABASE_ID},
      properties: {
        title: {
          type: "title",
          title: [{
              type: "text",
              text: {
                content: name
              }
          }],
        },
        "Blurb": {
          rich_text: [{
            type: "text",
            text: {
              content: blurb,
            }
          }],
        },
        "Website": {
          type: "url",
          url: website
        },
        "Youtube Video": {
          type: "url",
          url: youtubevideo
        },
      }
    })
    console.log("Success! Entry added.")
  } catch (error) {
    console.error(error.body)
  }
}

async function addWONameDead(oppType, website, youtubevideo, blurb) {
  try {
    const response = await notion.pages.create({
      parent:{database_id: NOTION_DATABASE_ID},
      properties: {
        "Opportunity Type": {
          type: "select",
          select: {
            name: oppType
          }
        },
        "Blurb": {
          rich_text: [{
            type: "text",
            text: {
              content: blurb,
            }
          }],
        },
        "Website": {
          type: "url",
          url: website
        },
        "Youtube Video": {
          type: "url",
          url: youtubevideo
        },
      }
    })
    console.log("Success! Entry added.")
  } catch (error) {
    console.error(error.body)
  }
}

async function addWONameOppDead(website, youtubevideo, blurb) {
  try {
    const response = await notion.pages.create({
      parent:{database_id: NOTION_DATABASE_ID},
      properties: {
        "Blurb": {
          rich_text: [{
            type: "text",
            text: {
              content: blurb,
            }
          }],
        },
        "Website": {
          type: "url",
          url: website
        },
        "Youtube Video": {
          type: "url",
          url: youtubevideo
        },
      }
    })
    console.log("Success! Entry added.")
  } catch (error) {
    console.error(error.body)
  }
}









//Spaces so it can be propper for notion DELETE TH ST RD ND
function datespaces(deadline) {
  deadline = deadline.replace("st", "");
  deadline = deadline.replace("nd", "");
  deadline = deadline.replace("rd", "");
  deadline = deadline.replace("th", "");
  return deadline;
}





// "HTTP(S)://" BUGS WITH my algo so just trim it
function removeHttp(notionInfo) {
  notionInfo = notionInfo.replace("Https://", "");
  notionInfo = notionInfo.replace("Http://", "");
  notionInfo = notionInfo.replace("https://", "");
  notionInfo = notionInfo.replace("http://", "");

  return notionInfo
}




// I don't want it to throw an error if there is no : after some prop
function noColon(notionInfo) {
  if (notionInfo.includes("name") && !notionInfo.includes("name:")) {
    notionInfo = notionInfo.replace("name", "name:");
  }
  if (notionInfo.includes("opportunity type") && !notionInfo.includes("opportunity type:")) {
    notionInfo = notionInfo.replace("opportunity type", "opportunity type:");
  }
  if (notionInfo.includes("deadline") && !notionInfo.includes("deadline:")) {
    notionInfo = notionInfo.replace("deadline", "deadline:");
  }
  if (notionInfo.includes("website") && !notionInfo.includes("website:")) {
    notionInfo = notionInfo.replace("website", "website:");
  }
  if (notionInfo.includes("youtube video") && !notionInfo.includes("youtube video:")) {
    notionInfo = notionInfo.replace("youtube video", "youtube video:");
  }
  return notionInfo
}
