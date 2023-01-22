import { Client } from "@notionhq/client";

// Define "require"
import { createRequire } from "module";
const require = createRequire(import.meta.url);


require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
import postcss from "postcss";
import postcssJs from "postcss-js";

const {TOKEN, SERVER_URL, NOTION_KEY, NOTION_DATABASE_ID} = process.env;
const TELEGRAM_API=`https://api.telegram.org/bot${TOKEN}`;
const URI = `/webhook/${TOKEN}`;
const WEBHOOK_URL = SERVER_URL+URI;


const notion = new Client({ auth: NOTION_KEY });



const app = express();
app.use(bodyParser.json());

function toJSSObject(cssText) {
  const root = postcss.parse(cssText);
  return postcssJs.objectify(root);
}

function toJSS(cssText) {
  try {
    return JSON.stringify(toJSSObject(cssText), null, 2);
  } catch (e) {
    return "Error translating CSS to JSS";
  }
}


const init = async()=> {
  const res = await axios.get(`${TELEGRAM_API}/setWebhook?url=${WEBHOOK_URL}`);
  console.log(res.data);
}



app.post(URI, async(req, res)=>{
  //Only if there is channel post
  if ('channel_post' in req.body) {

    let t = req.body.channel_post.text;
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
             notionInfo[index] = `;\n`;
           }
        })
      notionInfo = (notionInfo.join("").toString());
      //special-case..work out with retrieveSpacesCaptalize() together they make space and captalize
      notionInfo = notionInfo.replace(/(^\w|\s\w)/g, m => m.toUpperCase());
      notionInfo = notionInfo.split(" ").join("");

      notionInfo = removeHttp(notionInfo);
      notionInfo = JSON.parse(toJSS(notionInfo));

      for (const key of Object.keys(notionInfo)) {
        //null empty inputs==propper for notion
        if(notionInfo[key].length == 0) {
          notionInfo[key] = null;
        }

        //deadline into ISO...propper for notoin
        if(key=="deadline" && notionInfo[key] != null) {
          notionInfo[key] = datespaces(notionInfo[key]);
          let d = new Date(notionInfo[key]);
          d.setTime(d.getTime() - (d.getTimezoneOffset() * 60000));
          notionInfo[key] = d.toISOString().split('T')[0];
        } else if ((key == "name" && notionInfo[key] != null) || (key == "opportunitytype" && notionInfo[key] != null)) {
          //name&opportunitytype propper for notion after postcssJs package magic
          notionInfo[key] = retrieveSpacesCaptalize(notionInfo[key]);
        }
      }


      //DIDN'T FIND ANY APIs EASY METHOD TO CHECK THE INPUTS IN TELEGRAM channel_post SO I TURN IT MANUALLY
      if (!notionInfo.hasOwnProperty("name")) notionInfo["name"] = null;
      if (!notionInfo.hasOwnProperty("opportunitytype")) notionInfo["opportunitytype"] = null;
      if (!notionInfo.hasOwnProperty("deadline")) notionInfo["deadline"] = null;
      if (!notionInfo.hasOwnProperty("website")) notionInfo["website"] = null;
      if (!notionInfo.hasOwnProperty("youtubevideo")) notionInfo["youtubevideo"] = null;
      controls(notionInfo, t);

    }
  }
  return res.send()

})




app.listen(process.env.PORT || 5000, async ()=>{
  console.log("App is running on port", process.env.PORT || 5000);
  await init()
});




//CONTROL THE ADDs
function controls(notionInfo, t) {
  if (notionInfo["name"] != null && notionInfo["opportunitytype"] != null && notionInfo["deadline"] != null) {
    add(notionInfo["name"], notionInfo["opportunitytype"], notionInfo["deadline"], notionInfo["website"], notionInfo["youtubevideo"], t);
  }
  else if (notionInfo["name"] != null && notionInfo["opportunitytype"] != null && notionInfo["deadline"] == null) {
    addWODead(notionInfo["name"], notionInfo["opportunitytype"], notionInfo["website"], notionInfo["youtubevideo"], t);
  }
  else if (notionInfo["name"] != null && notionInfo["opportunitytype"] == null && notionInfo["deadline"] != null) {
    addWOOpp(notionInfo["name"], notionInfo["deadline"], notionInfo["website"], notionInfo["youtubevideo"], t);
  }
  else if (notionInfo["name"] == null && notionInfo["opportunitytype"] != null && notionInfo["deadline"] != null) {
    addWOName(notionInfo["opportunitytype"], notionInfo["deadline"], notionInfo["website"], notionInfo["youtubevideo"], t);
  }

  else if (notionInfo["name"] != null && notionInfo["opportunitytype"] == null && notionInfo["deadline"] == null) {
    addWOOppDead(notionInfo["name"], notionInfo["website"], notionInfo["youtubevideo"], t);
  }
  else if (notionInfo["name"] == null && notionInfo["opportunitytype"] != null && notionInfo["deadline"] == null) {
    addWONameDead(notionInfo["opportunitytype"], notionInfo["website"], notionInfo["youtubevideo"], t);
  }
  else if (notionInfo["name"] == null && notionInfo["opportunitytype"] == null && notionInfo["deadline"] == null) {
    addWONameOppDead(notionInfo["website"], notionInfo["youtubevideo"], t);
  }
}



//DIDN'T FIND ANY APIs EASY METHOD TO CHECK THE INPUTS IN TELEGRAM MESSAGE SO I TURN IT MANUALLY
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








//THE NPM PACKAGE TRIM SPACES AND I NEED IT:
function retrieveSpacesCaptalize(wOSpace) {
  return (wOSpace.replace(/([A-Z])([A-Z])([a-z])|([a-z])([A-Z])/g, '$1$4 $2$3$5' )).replace(/(^\w|\s\w)/g, m => m.toUpperCase());
} //spaces&captalizin so it can be propper for notion



//Spaces so it can be propper for notion
function datespaces(deadline) {
  let chars = [...deadline].reverse();
  for (let i in chars) {
      if(i == 3) chars[3] = " "+chars[i];
      else if (chars[i].match(/[a-z]/i)) {
          chars[i] = chars[i]+" ";
          return chars.reverse().join("");
      }
  }
}





// "HTTP(S)://" BUGS WITH POSTCSSJS so just trim it
function removeHttp(notionInfo) {
  notionInfo = notionInfo.replace("Https://", "");
  notionInfo = notionInfo.replace("Http://", "");
  notionInfo = notionInfo.replace("https://", "");
  notionInfo = notionInfo.replace("http://", "");

  return notionInfo
}
