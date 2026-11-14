// Cheap, client-side keyword check of the sentence being typed (no LLM): which of the four things the
// planner needs are already mentioned. Drives the logo's stations lighting up one by one.
import { nationalityIn } from "./profileSentence";

const CITIES =
  "helsinki espoo vantaa kauniainen tampere turku oulu jyväskylä jyvaskyla lahti kuopio pori joensuu lappeenranta vaasa rovaniemi seinäjoki seinajoki kotka hämeenlinna hameenlinna kokkola mikkeli porvoo salo kerava järvenpää jarvenpaa nokia kajaani rauma savonlinna";
const CITY = new RegExp(`\\b(${CITIES.split(" ").join("|")})\\b`, "i");
const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i;
const DATE = /\b(next|this|in)\s+(week|month|spring|summer|autumn|fall|winter)\b|\b(tomorrow|today|soon|already here|arriving|arrived)\b|\b\d{1,2}[./]\s?\d{1,2}\b|\b(20\d\d)\b/i;
const PURPOSE = /\b(job|work(ing)?|employ(ed|ment|er)|engineer|developer|nurse|doctor|researcher|stud(y|ying|ent)|master'?s|bachelor|phd|university|degree|family|wife|husband|spouse|partner|child(ren)?|kids|reunif)/i;
const CITIZEN = /\b(citizen(ship)?|national(ity)?|passport|eu\b|eea|nordic|non-eu)/i;

export type Mentions = { citizenship: boolean; city: boolean; date: boolean; purpose: boolean };

export function mentions(text: string): Mentions {
  return {
    citizenship: !!nationalityIn(text) || CITIZEN.test(text),
    city: CITY.test(text),
    date: MONTHS.test(text) || DATE.test(text),
    purpose: PURPOSE.test(text),
  };
}
