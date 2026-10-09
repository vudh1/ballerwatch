import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverRatsScheduleLinks, extractPublishedRatsScheduleLinks,
  ratsScheduleFieldSearchUrl, RATS_SCHEDULE_PAGE,
} from "../../../backend/league/schedule-venue-links.mjs";

const SOUTH = "Walt Hundley Playfield - Mod South";
const NORTH = "Walt Hundley Playfield - Mod North";
const LINK = "https://www.google.com/maps?q=Walt+Hundley+Playfield+-+Mod+South";

test("reuses the exact RATS Schedule and Standings Maps query format", () => {
  assert.equal(ratsScheduleFieldSearchUrl(SOUTH), LINK);
  assert.equal(ratsScheduleFieldSearchUrl(""), "");
  assert.equal(ratsScheduleFieldSearchUrl("  Walt  Hundley Playfield - Mod South "), LINK);
});

test("extracts published schedule hrefs, never crossing south/north field subdivisions", () => {
  const source = '<div><a href="' + LINK.replace(/&/g,"&amp;") + '">' +
    SOUTH + '</a><a href="https://www.google.com/maps?q=Walt+Hundley+Playfield+-+Mod+North">' +
    NORTH + "</a></div>";
  assert.deepEqual(extractPublishedRatsScheduleLinks(source,[SOUTH,NORTH]),[
    {name:SOUTH,mapUrl:LINK},
    {name:NORTH,mapUrl:"https://www.google.com/maps?q=Walt+Hundley+Playfield+-+Mod+North"},
  ]);
  assert.deepEqual(extractPublishedRatsScheduleLinks(source,["Walt Hundley Playfield"]),[]);
  assert.deepEqual(extractPublishedRatsScheduleLinks(source,["Walt Hundley Playfield - Mod East"]),[]);
});

test("accepts links embedded in a schedule JSON script, but not foreign URLs", () => {
  const raw = '{"field":"Walt Hundley Playfield - Mod South",' +
    '"map":"https:\\/\\/www.google.com\\/maps?q=Walt+Hundley+Playfield+-+Mod+South"}';
  assert.deepEqual(extractPublishedRatsScheduleLinks(raw,[SOUTH]),[{name:SOUTH,mapUrl:LINK}]);
  assert.deepEqual(extractPublishedRatsScheduleLinks(
    '<a href="https://google.com.evil.invalid/maps?q=Walt+Hundley+Playfield+-+Mod+South">' +
    SOUTH + "</a>",[SOUTH]),[]);
  assert.deepEqual(extractPublishedRatsScheduleLinks(
    '<a href="https://www.google.com/maps?q=Walt+Hundley+Playfield+-+Mod+North">' +
    SOUTH + "</a>",[SOUTH]),[]);
});

test("schedule discovery fetches only RATS, rejects redirects and tolerates JavaScript shells", async () => {
  const calls = [];
  const found = await discoverRatsScheduleLinks([SOUTH],{
    fetchImpl:async (url,options) => {
      calls.push({url,options});
      return {ok:true,headers:{get:()=>"text/html"},
        text:async()=>'<a href="' + LINK + '">' + SOUTH + "</a>"};
    },
  });
  assert.deepEqual(found,[{name:SOUTH,mapUrl:LINK}]);
  assert.equal(calls[0].url,RATS_SCHEDULE_PAGE);
  assert.equal(calls[0].options.redirect,"error");
  assert.deepEqual(await discoverRatsScheduleLinks([SOUTH],{
    fetchImpl:async()=>({ok:true,headers:{get:()=>"text/html"},
      text:async()=>"<html><div id='app'></div></html>"}),
  }),[]);
  assert.deepEqual(await discoverRatsScheduleLinks([SOUTH],{
    fetchImpl:async()=>{throw new Error("offline");},
  }),[]);
});
