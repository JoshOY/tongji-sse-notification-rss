import '@babel/polyfill';
import _ from 'lodash';
import request from 'request-promise-native';
import cheerio from 'cheerio';
import { Feed } from 'feed';
import express from 'express';
import config from './config.json';
import he from 'he';

const BASE_URL = 'http://sse.tongji.edu.cn';
const SITE_URL = 'http://sse.tongji.edu.cn/Data/List/xwdt';
const INTERVAL_SECONDS = 600;


function generateNewFeed() {
  return new Feed({
    title: '同济软院通知 RSS',
    description: '同济软院通知 RSS',
    id: config.feedUrl,
    link: feedUrl,
    language: 'zh-cn',
    ttl: '60',
    updated: new Date(),
    feedLinks: {
      atom: config.atomUrl,
    },
    author: {
      name: 'Josh Ouyang',
      email: 'me@joshoy.org',
    },
  });
}

global.FEED = generateNewFeed();

async function getNewsList() {
  let responseBody = null;
  try {
    responseBody = await request.get(SITE_URL);
  } catch (err) {
    console.error(`Request failed! Retry after ${INTERVAL_SECONDS} seconds...`);
    return null;
  }
  // if success
  // console.log(page);
  return responseBody;
}

const parseIndexPage = (html) => {
  let ret = [];
  try {
    const $ = cheerio.load(html);
    const list = $('.data-list li');
    // console.log(test.text());
    $(list).each((idx, elem) => {
      const title = $($(elem)[0].children[1]).text().toString().trim();
      const link = BASE_URL + $($(elem)[0].children[1]).attr('href');
      const time = $($(elem)[0].children[3]).text().toString().trim();
      console.log(`title[${idx}] =`, title);
      console.log(`link[${idx}] =`, link);
      console.log(`time[${idx}] =`, time);
      ret.push({
        title,
        link,
        time,
      });
    });
  } catch (err) {
    console.error(err);
    console.error('Parse html failed.');
    return [];
  }
  return ret;
};

async function getNewsContent(newsItem) {
  let responseBody = null;
  try {
    responseBody = await request.get(newsItem.link);
  } catch (err) {
    console.error(`Request failed! Retry after ${INTERVAL_SECONDS} seconds...`);
    return _.assign({}, newsItem, {
      contentHTML: '',
    });
  }
  // if success
  const $ = cheerio.load(responseBody);  // { decodeEntities: false }
  const contentHTML = $('.view-cnt').html()
    || `<div>Read news: <a href="${newsItem.link}">${newsItem.link}</a></div>` ;
  return _.assign({}, newsItem, {
    contentHTML: he.decode(contentHTML),
  });
}

async function update() {
  const responseBody = await getNewsList();
  const list = parseIndexPage(responseBody);
  const newsItems = await Promise.all(list.map(getNewsContent));
  // console.log(newsItems.length ? newsItems[0] : 'list empty');
  if (!newsItems || !newsItems.length) {
    console.error('Cannot find any notifications. Retry later.');
    return 1;
  }
  global.FEED = generateNewFeed();
  newsItems.forEach((item) => {
    global.FEED.addItem({
      title: item.title,
      description: item.title,
      content: item.contentHTML,
      link: item.link,
      id: item.link,
      date: new Date(item.time),
    });
  });
  return 0;
}

async function main() {
  setInterval(update, INTERVAL_SECONDS * 1000);
  update();

  const app = express();
  app.get('/rss', (req, res) => {
    res.set('Content-Type', 'application/xml; charset=utf-8');
    const xml = global.FEED.rss2();
    res.write(xml);
    res.end();
  });
  app.get('/rss/atom', (req, res) => {
    res.set('Content-Type', 'application/xml; charset=utf-8');
    const xml = global.FEED.atom1();
    res.write(xml);
    res.end();
  });
  app.listen(7800);
}

main().catch((err) => {
  console.error(err);
});
