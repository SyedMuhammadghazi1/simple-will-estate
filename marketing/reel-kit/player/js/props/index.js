// Prop registry: reel.json refers to props by these keys ("prop": { "type": "stat-card", ... }).
// To add one, create a module next to this file (see _util.js for the contract) and list it here.

import brand from "./brand.js";
import calendar from "./calendar.js";
import chart from "./chart.js";
import checklist from "./checklist.js";
import docStamp from "./doc-stamp.js";
import dots from "./dots.js";
import figure from "./figure.js";
import download from "./download.js";
import flipClock from "./flip-clock.js";
import formulaCard from "./formula-card.js";
import gavel from "./gavel.js";
import image from "./image.js";
import maths from "./maths.js";
import meter from "./meter.js";
import note from "./note.js";
import pair from "./pair.js";
import priceTags from "./price-tags.js";
import quote from "./quote.js";
import receipt from "./receipt.js";
import ratioPeople from "./ratio-people.js";
import shareSheet from "./share-sheet.js";
import signDoc from "./sign-doc.js";
import statCard from "./stat-card.js";
import sticker from "./sticker.js";
import timer from "./timer.js";

export const PROPS = {
  brand,
  calendar,
  chart,
  checklist,
  "doc-stamp": docStamp,
  dots,
  figure,
  download,
  "flip-clock": flipClock,
  "formula-card": formulaCard,
  gavel,
  image,
  maths,
  meter,
  note,
  pair,
  "price-tags": priceTags,
  quote,
  receipt,
  "ratio-people": ratioPeople,
  "share-sheet": shareSheet,
  "sign-doc": signDoc,
  "stat-card": statCard,
  sticker,
  timer,
};
