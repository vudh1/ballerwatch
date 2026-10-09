import test from "node:test";
import assert from "node:assert/strict";
import { answerFixtureQuestion } from "../../../backend/shared/fixture-ai.mjs";

const fixtures = [
  {
    key:"rats:match-1", date:"2099-10-13",
    team:"Supermokh FC", opponent:"PhoSaiGon", startTime:"19:15",
    location:"Walt Hundley Playfield - Mod South", jerseyColor:"Green",
  },
  {
    key:"rats:match-2", date:"2099-10-20",
    team:"Supermokh FC", opponent:"Eagles United", startTime:"20:30",
    location:"Magnuson Park - Field 2", jerseyColor:"White",
  },
  {
    key:"rats:match-3", date:"2099-10-27",
    team:"Another Team", opponent:"PhoSaiGon", startTime:"18:00",
    location:"Maple Leaf Playground", jerseyColor:"Blue",
  },
];

test("BallerWatch AI 8 answers opponent-name questions from grounded upcoming fixtures", () => {
  const answer = answerFixtureQuestion("When do we play PhoSaiGon?", fixtures, {}, "2099-10-01");
  assert.equal(answer.intent, "league_fixture");
  assert.match(answer.reply, /2099-10-13/);
  assert.match(answer.reply, /7:15 PM \(Pacific\)/);
  assert.match(answer.reply, /2099-10-27/);
  assert.match(answer.reply, /Source: RATS monitored schedule/);
  assert.equal(answer.lastMatchKey, "", "multiple fixtures must not store ambiguous context");
});

test("BallerWatch AI understands two teams, venue, jersey and specific-match follow-ups", () => {
  const first = answerFixtureQuestion(
    "Where is Supermokh FC vs PhoSaiGon?", fixtures, {}, "2099-10-01");
  assert.equal(first.lastMatchKey, "rats:match-1");
  assert.equal(first.lastDate, "2099-10-13");
  assert.match(first.reply, /Walt Hundley Playfield - Mod South/);
  assert.doesNotMatch(first.reply, /Magnuson/);
  const followup = answerFixtureQuestion("What jersey do we wear?", fixtures, {
    lastMatchKey:first.lastMatchKey,
  }, "2099-10-01");
  assert.equal(followup.lastMatchKey, first.lastMatchKey);
  assert.match(followup.reply, /Green jersey/);
  const where = answerFixtureQuestion("Where is that match?", fixtures, {
    lastMatchKey:first.lastMatchKey,
  }, "2099-10-01");
  assert.match(where.reply, /Walt Hundley/);
});

test("BallerWatch AI never reuses a fake or deleted fixture context", () => {
  assert.equal(answerFixtureQuestion("where is that match?", fixtures, {
    lastMatchKey:"invented",
  }, "2099-10-01"), null);
  assert.equal(answerFixtureQuestion("where is that match?", fixtures.slice(1), {
    lastMatchKey:"rats:match-1",
  }, "2099-10-01"), null);
});

test("BallerWatch AI fails closed on unpublished, past, or ambiguous match data", () => {
  const unknown = answerFixtureQuestion("Where do we play PhoSaiGon?", fixtures, {}, "2100-01-01");
  assert.match(unknown.reply,/No upcoming RATS fixture is published/);
  assert.equal(unknown.lastMatchKey, "");
  assert.equal(answerFixtureQuestion("Who will win?", fixtures, {}, "2099-10-01"), null);
  assert.equal(answerFixtureQuestion("What was the record between Supermokh and PhoSaiGon?",
    fixtures, {}, "2099-10-01"),null);
  assert.equal(answerFixtureQuestion("Does Supermokh play?", fixtures, {}, "2099-10-01"),null);
  const missing = answerFixtureQuestion("Where is Supermokh FC vs PhoSaiGon?",
    [{key:"c",team:"Supermokh FC",opponent:"PhoSaiGon",date:"2099-10-12"}], {},
    "2099-10-01");
  assert.match(missing.reply,/Venue not yet published/);
});

test("monitoring both sides of a fixture does not duplicate it", () => {
  const same = {...fixtures[0],key:"rats:reverse",team:"PhoSaiGon",opponent:"Supermokh FC"};
  const answer = answerFixtureQuestion("when do Supermokh FC and PhoSaiGon play?",
    [fixtures[0],same],{},"2099-10-01");
  assert.equal(answer.lastMatchKey,"rats:match-1");
  assert.doesNotMatch(answer.reply,/Found 2 matching/);
});

test("BallerWatch AI does not expose RSVP private roster or use external models", () => {
  const answer=answerFixtureQuestion("where is Supermokh FC vs PhoSaiGon?",
    [{...fixtures[0],players:[{name:"Private Example Name"}]}],{},"2099-10-01");
  assert.doesNotMatch(answer.reply,/Private Example Name/);
});
