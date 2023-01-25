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




const init = async()=> {
  const res = await axios.get(`${TELEGRAM_API}/setWebhook?url=${WEBHOOK_URL}`);
  console.log(res.data);
}



app.post(URI, async(req, res)=>{
  //Only if there is channel post
  if ('message' in req.body) {
    let input = req.body.message.text;
    // ignore texts without props and the equals to seprate from props and blurb
    if (input.includes("===") && (input.includes("Name") && input.includes("Opportunity Type") && input.includes("Deadline") && (input.includes("Website") || input.includes("YouTube Video")))) {

      //seprate blurb alone, notoinINfo alone
      let [notionInfo, blurb] = input.split(input.match(/(?==)(=*)/s)[0]).reduce((sum,el,index)=>{
        return index==0?[el]:[sum[0],sum?.[1]??""+el.replace(/(?==)(=*)/g, "")]
        },[]);


        let mainNotoinInfo = {
          name: null,
          'opportunity type': null,
          deadline: null,
          website: null,
          'youtube video': null
        }

        //make sure there are collons and lowcased it so it matched with the mainNotoinInfo
        Object.getOwnPropertyNames(mainNotoinInfo).forEach(item => {
          let keys = new RegExp(item, 'i');
          notionInfo = notionInfo.replace(keys, item);
          if (notionInfo.match(keys) && !notionInfo.match(new RegExp(item+":", 'i'))) {
            notionInfo = notionInfo.replace(keys, item+":");
          }
        })


        let NotionInfo = objectify(notionInfo, mainNotoinInfo)

        NotionInfo.deadline = dateFormat(NotionInfo.deadline);
        if (!NotionInfo.deadline) return res.send();
        add(NotionInfo["name"], NotionInfo["opportunity type"], dateFormat(NotionInfo.deadline), NotionInfo["website"], NotionInfo["youtube video"], blurb);

    }
  }
  return res.send();

})




app.listen(process.env.PORT || 5000, async ()=>{
  console.log("App is running on port", process.env.PORT || 5000);
  await init()
});


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




function objectify(notionInfo, mainNotoinInfo) {
  notionInfo = removeHttp(notionInfo);
  //2D array
  notionInfo = notionInfo.split(/\n/).map(item => item.length==0?false:item.split(":")).filter(Boolean);
  //objectify everything and null non-typed props
  let NotionInfo = {...mainNotoinInfo,...Object.fromEntries(notionInfo)};
  return NotionInfo;
}



function dateFormat(deadline) {
  deadline = datespaces(deadline.toLowerCase());
  let d = new Date(deadline);
  if (d.toString() === 'Invalid Date') {
    console.error("Date Error");
    return false;
  }
  d.setTime(d.getTime() - (d.getTimezoneOffset() * 60000));
  deadline = d.toISOString().split('T')[0];
  return deadline;
}
